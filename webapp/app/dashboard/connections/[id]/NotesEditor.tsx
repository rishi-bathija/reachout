'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Check, X } from 'lucide-react'

type Props = {
  connectionId: string
  initialNotes: string | null
}

export default function NotesEditor({ connectionId, initialNotes }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [draft, setDraft] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const startEdit = () => {
    setDraft(notes)
    setError('')
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setDraft(notes)
    setError('')
    setIsEditing(false)
  }

  const saveNotes = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: draft.trim() === '' ? null : draft }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to save notes')
      }
      const nextNotes = draft.trim()
      setNotes(nextNotes)
      setIsEditing(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save notes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Notes</label>
        {!isEditing ? (
          <Button type="button" variant="ghost" size="sm" onClick={startEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
              <X className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={saveNotes} disabled={saving}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder="Add notes about this connection..."
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <p className="text-gray-600 mt-1 whitespace-pre-wrap">
          {notes.trim() ? notes : 'No notes yet.'}
        </p>
      )}
    </div>
  )
}
