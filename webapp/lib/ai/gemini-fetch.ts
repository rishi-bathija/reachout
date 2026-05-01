type GeminiRequestParams = {
  apiKey: string
  prompt: string
  model?: string
  timeoutMs?: number
  maxAttempts?: number
}

const DEFAULT_TIMEOUT_MS = 25_000
const DEFAULT_MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 12_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeBackoffMs(attempt: number): number {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1))
  const jitter = Math.floor(Math.random() * 300)
  return exponential + jitter
}

function parseRetryAfterHeaderMs(value: string | null): number | undefined {
  if (!value) return undefined

  const asSeconds = Number.parseFloat(value)
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.ceil(asSeconds * 1000)
  }

  const asDate = Date.parse(value)
  if (Number.isNaN(asDate)) return undefined

  const msUntilDate = asDate - Date.now()
  if (msUntilDate <= 0) return undefined
  return msUntilDate
}

function shouldRetry(status: number): boolean {
  return status === 429 || status === 503
}

export async function fetchGeminiWithRetry({
  apiKey,
  prompt,
  model = 'gemini-2.5-flash',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: GeminiRequestParams): Promise<Response> {
  let lastError: unknown
  const effectiveTimeout = Math.max(1000, timeoutMs)

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout)

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: controller.signal,
        }
      )

      if (response.ok || !shouldRetry(response.status) || attempt >= maxAttempts) {
        return response
      }

      const retryAfterMs = parseRetryAfterHeaderMs(response.headers.get('retry-after'))
      await sleep(retryAfterMs ?? computeBackoffMs(attempt))
    } catch (error: unknown) {
      lastError = error
      const isAbort = error instanceof Error && error.name === 'AbortError'
      if (!isAbort || attempt >= maxAttempts) {
        throw error
      }

      await sleep(computeBackoffMs(attempt))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError ?? new Error('Gemini request failed')
}
