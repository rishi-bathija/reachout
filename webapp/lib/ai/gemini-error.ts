type FriendlyGeminiError = {
  code: 'RATE_LIMITED' | 'UNAUTHORIZED' | 'UNAVAILABLE' | 'UPSTREAM_ERROR'
  message: string
  retryAfterSec?: number
}

function parseRetryAfterSeconds(message: string): number | undefined {
  const match = message.match(/retry\s+in\s+([\d.]+)\s*s/i)
  if (!match) return undefined
  const parsed = Number.parseFloat(match[1] ?? '')
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(1, Math.ceil(parsed))
}

function parseRetryInfo(details: unknown): number | undefined {
  if (!Array.isArray(details)) return undefined
  for (const item of details) {
    if (!item || typeof item !== 'object') continue
    const retryDelay = (item as { retryDelay?: unknown }).retryDelay
    if (typeof retryDelay === 'string') {
      const secMatch = retryDelay.match(/^([\d.]+)s$/i)
      if (secMatch) {
        const parsed = Number.parseFloat(secMatch[1] ?? '')
        if (Number.isFinite(parsed)) {
          return Math.max(1, Math.ceil(parsed))
        }
      }
    }
  }
  return undefined
}

function parseRetryAfterHeaderSeconds(value: string | null): number | undefined {
  if (!value) return undefined

  const asSeconds = Number.parseFloat(value)
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.max(1, Math.ceil(asSeconds))
  }

  const asDate = Date.parse(value)
  if (Number.isNaN(asDate)) return undefined

  const seconds = Math.ceil((asDate - Date.now()) / 1000)
  if (seconds <= 0) return undefined
  return seconds
}

export async function mapGeminiError(response: Response): Promise<{
  status: number
  error: FriendlyGeminiError
}> {
  const rawText = await response.text()

  let upstreamMessage = 'AI service request failed.'
  let retryAfterSec: number | undefined = parseRetryAfterHeaderSeconds(
    response.headers.get('retry-after')
  )
  try {
    const parsed = JSON.parse(rawText) as {
      error?: {
        message?: string
        details?: unknown
      }
    }
    if (parsed.error?.message) {
      upstreamMessage = parsed.error.message
      retryAfterSec =
        parseRetryInfo(parsed.error.details) ??
        parseRetryAfterSeconds(upstreamMessage) ??
        retryAfterSec
    }
  } catch {
    if (rawText.trim()) upstreamMessage = rawText
  }

  if (response.status === 429) {
    return {
      status: 429,
      error: {
        code: 'RATE_LIMITED',
        message: retryAfterSec
          ? `AI limit reached. Try again in about ${retryAfterSec}s.`
          : 'AI limit reached. Please retry in a moment.',
        retryAfterSec,
      },
    }
  }

  if (response.status === 401 || response.status === 403) {
    return {
      status: 502,
      error: {
        code: 'UNAUTHORIZED',
        message: 'AI service configuration issue. Please check API key setup.',
      },
    }
  }

  if (response.status >= 500) {
    return {
      status: 503,
      error: {
        code: 'UNAVAILABLE',
        message: 'AI service is temporarily unavailable. Please try again shortly.',
        retryAfterSec,
      },
    }
  }

  return {
    status: 502,
    error: {
      code: 'UPSTREAM_ERROR',
      message: upstreamMessage.length > 180 ? 'AI request failed. Please retry.' : upstreamMessage,
      retryAfterSec,
    },
  }
}
