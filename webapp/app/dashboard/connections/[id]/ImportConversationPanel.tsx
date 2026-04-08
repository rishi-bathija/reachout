'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Props = {
  connectionId: string
}

type ImportResult = {
  parsedCount: number
  insertedCount: number
  skippedDuplicates: number
}

export default function ImportConversationPanel({ connectionId }: Props) {
  const [transcript, setTranscript] = useState('')
  const [userAliases, setUserAliases] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const router = useRouter()

  const handleImport = async () => {
    if (!transcript.trim()) {
      setError('Paste a transcript first.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(`/api/connections/${connectionId}/import-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          userAliases,
        }),
      })
      const data = (await response.json()) as ImportResult & { error?: string }

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to import conversation')
      }

      setResult({
        parsedCount: data.parsedCount,
        insertedCount: data.insertedCount,
        skippedDuplicates: data.skippedDuplicates,
      })
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import conversation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Conversation (Bulk Paste)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user-aliases">
            Your Name Aliases (comma-separated, optional)
          </Label>
          <Input
            id="user-aliases"
            value={userAliases}
            onChange={(e) => setUserAliases(e.target.value)}
            placeholder="Rishi Bathija, Rishi"
          />
          <p className="text-xs text-gray-500">
            Helps parser map messages to `USER` correctly.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="transcript">Raw LinkedIn Transcript</Label>
          <Textarea
            id="transcript"
            rows={12}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the copied LinkedIn conversation here..."
          />
        </div>

        <Button type="button" onClick={handleImport} disabled={loading}>
          {loading ? 'Importing...' : 'Import Conversation'}
        </Button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && (
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-700">
            <p>Parsed: {result.parsedCount}</p>
            <p>Inserted: {result.insertedCount}</p>
            <p>Skipped duplicates: {result.skippedDuplicates}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
