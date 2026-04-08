'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type GeneratedMessageHistory = {
  id: string
  message: string
  generatedAt: Date
  used: boolean
}

type Props = {
  connectionId: string
  connectionName: string
  company: string
  role: string
  jobTitle: string | null
  jobUrl: string | null
  notes: string | null
  profileUrl: string | null
  history: GeneratedMessageHistory[]
}

const VARIATIONS = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'short', label: 'Short and crisp' },
  { value: 'casual', label: 'Casual and direct' },
  { value: 'warm', label: 'Warm and friendly' },
  { value: 'follow_up', label: 'Follow-up oriented' },
]

export default function GenerateMessagePanel({
  connectionId,
  connectionName,
  company,
  role,
  jobTitle,
  jobUrl,
  notes,
  profileUrl,
  history: initialHistory,
}: Props) {
  const [variation, setVariation] = useState('balanced')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(initialHistory[0]?.message ?? '')
  const [selectedGeneratedId, setSelectedGeneratedId] = useState<string | null>(initialHistory[0]?.id ?? null)
  const [history, setHistory] = useState(initialHistory)
  const [copied, setCopied] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    if (!cooldownUntil) return
    const timer = setInterval(() => setNowMs(Date.now()), 500)
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
      return 'Message generation API route not found. Check server route configuration.'
    }

    return `Server returned a non-JSON response (${response.status}).`
  }

  const hasDraft = useMemo(() => draft.trim().length > 0, [draft])

  const generateMessage = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/connections/${connectionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variation }),
      })

      const data = await readApiResponse<{
        generatedMessage?: GeneratedMessageHistory
        error?: unknown
      }>(response)
      if (!response.ok) {
        const payload = getErrorPayload(data?.error)
        if (payload.code === 'RATE_LIMITED' && payload.retryAfterSec) {
          setCooldownUntil(Date.now() + payload.retryAfterSec * 1000)
        }
        throw new Error(payload.message ?? getFallbackErrorMessage(response))
      }

      const generated = data?.generatedMessage
      if (!generated) {
        throw new Error('Missing generated message in API response.')
      }
      setDraft(generated.message)
      setSelectedGeneratedId(generated.id)
      setHistory((prev) => [generated, ...prev])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate message')
    } finally {
      setLoading(false)
    }
  }

  const copyDraft = async () => {
    if (!hasDraft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setError('Clipboard access failed. Copy manually.')
    }
  }

  const saveAsMessage = async () => {
    if (!hasDraft) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/connections/${connectionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: draft.trim(),
          sender: 'USER',
          generatedMessageId: selectedGeneratedId,
        }),
      })
      const data = await readApiResponse<{ error?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.error ?? getFallbackErrorMessage(response))
      }

      if (selectedGeneratedId) {
        setHistory((prev) =>
          prev.map((item) => (item.id === selectedGeneratedId ? { ...item, used: true } : item))
        )
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save message')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Message Generator</CardTitle>
        <p className="text-sm text-gray-600">
          Context: {connectionName} | {role} at {company}
          {jobTitle ? ` | Target job: ${jobTitle}` : ''}
          {jobUrl ? ' | Includes job link context' : ''}
          {notes ? ' | Includes your notes context' : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="variation">Variation</Label>
            <Select value={variation} onValueChange={setVariation}>
              <SelectTrigger id="variation" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIATIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generateMessage} disabled={!canGenerate}>
            {loading
              ? 'Generating...'
              : remainingSec > 0
                ? `Retry in ${remainingSec}s`
                : 'Generate / Regenerate'}
          </Button>
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" type="button">Open LinkedIn</Button>
            </a>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="generated-draft">Generated Draft (Editable)</Label>
          <Textarea
            id="generated-draft"
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Generated message will appear here..."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copyDraft} disabled={!hasDraft}>
            {copied ? 'Copied' : 'Copy to Clipboard'}
          </Button>
          <Button type="button" onClick={saveAsMessage} disabled={!hasDraft || saving}>
            {saving ? 'Saving...' : 'Save as My Message'}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="space-y-2 border-t pt-4">
          <h4 className="text-sm font-medium">Generated History</h4>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No generated drafts yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDraft(item.message)
                    setSelectedGeneratedId(item.id)
                  }}
                  className="w-full rounded-md border p-3 text-left hover:bg-gray-50"
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>{formatDistanceToNow(new Date(item.generatedAt), { addSuffix: true })}</span>
                    <span>{item.used ? 'Used' : 'Not used'}</span>
                  </div>
                  <p className="line-clamp-3 text-sm text-gray-700">{item.message}</p>
                </button>
              ))}
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  )
}
