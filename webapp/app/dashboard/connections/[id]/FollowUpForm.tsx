'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  connectionId: string
  nextFollowUpAt: string | null
}

function toLocalDateTimeValue(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

export default function FollowUpForm({ connectionId, nextFollowUpAt }: Props) {
  const [value, setValue] = useState(toLocalDateTimeValue(nextFollowUpAt))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const hasValue = useMemo(() => value.trim().length > 0, [value])

  const updateFollowUp = async (nextValue: string | null) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextFollowUpAt: nextValue,
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to update follow-up')
      }
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update follow-up')
    } finally {
      setLoading(false)
    }
  }

  const setQuickDays = async (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    await updateFollowUp(d.toISOString())
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="follow-up-at">Next Follow-up</Label>
        <Input
          id="follow-up-at"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => updateFollowUp(hasValue ? new Date(value).toISOString() : null)}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Follow-up'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setQuickDays(2)} disabled={loading}>
          +2 days
        </Button>
        <Button type="button" variant="outline" onClick={() => setQuickDays(5)} disabled={loading}>
          +5 days
        </Button>
        <Button type="button" variant="outline" onClick={() => setQuickDays(7)} disabled={loading}>
          +7 days
        </Button>
        <Button type="button" variant="ghost" onClick={() => updateFollowUp(null)} disabled={loading}>
          Clear
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
