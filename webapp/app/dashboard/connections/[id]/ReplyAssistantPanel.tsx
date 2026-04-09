'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  connectionId: string
}

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
]

const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'reply', label: 'Reply' },
]

export default function ReplyAssistantPanel({ connectionId }: Props) {
  const [tone, setTone] = useState('professional')
  const [mode, setMode] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const [effectiveMode, setEffectiveMode] = useState<'reply' | 'follow_up' | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!cooldownUntil) return
    const timer = setInterval(() => {
      const now = Date.now()
      setNowMs(now)
      if (now >= cooldownUntil) {
        setCooldownUntil(null)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [cooldownUntil])

  const remainingSec =
    cooldownUntil && cooldownUntil > nowMs
      ? Math.ceil((cooldownUntil - nowMs) / 1000)
      : 0

  const canGenerate = !loading && remainingSec === 0

  type ApiError = {
    code?: string
    message?: string
    retryAfterSec?: number
  }

  const getErrorPayload = (value: unknown): ApiError => {
    if (!value || typeof value !== 'object') return {}
    return value as ApiError
  }

  const readApiResponse = async <T,>(response: Response): Promise<T | null> => {
    const rawText = await response.text()
    if (!rawText) return null

    try {
      return JSON.parse(rawText) as T
    } catch {
      return null
    }
  }

  const getFallbackErrorMessage = (response: Response): string => {
    if (response.status === 401 || response.status === 403) {
      return 'Your session has expired. Please sign in again.'
    }

    if (response.status === 404) {
      return 'Reply API route not found. Check server route configuration.'
    }

    return `Server returned a non-JSON response (${response.status}).`
  }

  const generateReplies = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/connections/${connectionId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone, mode }),
      })
      const data = (await readApiResponse<{
        suggestions?: string[]
        effectiveMode?: 'reply' | 'follow_up'
        error?: unknown
      }>(response)) ?? {}

      if (!response.ok) {
        const payload = getErrorPayload(data.error)
        if (payload.code === 'RATE_LIMITED' && payload.retryAfterSec) {
          setCooldownUntil(Date.now() + payload.retryAfterSec * 1000)
        }
        throw new Error(payload.message ?? getFallbackErrorMessage(response))
      }

      setSuggestions(data.suggestions ?? [])
      setEffectiveMode(data.effectiveMode ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate replies')
    } finally {
      setLoading(false)
    }
  }

  const copySuggestion = async (message: string, index: number) => {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 1200)
    } catch {
      setError('Clipboard access failed. Copy manually.')
    }
  }

  const saveSuggestionAsMessage = async (message: string, index: number) => {
    setSavingIndex(index)
    setError('')

    try {
      const response = await fetch(`/api/connections/${connectionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
          sender: 'USER',
        }),
      })
      const data = (await readApiResponse<{ error?: string }>(response)) ?? {}
      if (!response.ok) {
        throw new Error(data.error ?? getFallbackErrorMessage(response))
      }

      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save reply')
    } finally {
      setSavingIndex(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reply Assistant</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="reply-tone">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger id="reply-tone" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reply-mode">Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="reply-mode" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generateReplies} disabled={!canGenerate}>
            {loading
              ? 'Generating...'
              : remainingSec > 0
                ? `Retry in ${remainingSec}s`
                : 'Suggest 3 Replies'}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {effectiveMode && (
          <p className="text-xs text-gray-500">
            Generated in <span className="font-medium">{effectiveMode === 'follow_up' ? 'Follow-up' : 'Reply'}</span>{' '}
            mode.
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="space-y-2 rounded-md border p-3">
                <Textarea
                  rows={4}
                  value={suggestion}
                  onChange={(e) =>
                    setSuggestions((prev) => prev.map((item, idx) => (idx === index ? e.target.value : item)))
                  }
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copySuggestion(suggestions[index], index)}
                  >
                    {copiedIndex === index ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveSuggestionAsMessage(suggestions[index], index)}
                    disabled={savingIndex === index}
                  >
                    {savingIndex === index ? 'Saving...' : 'Use as My Reply'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
