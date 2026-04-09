'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function AddMessageForm({ connectionId }: { connectionId: string }) {
  const [content, setContent] = useState('')
  const [sender, setSender] = useState<'USER' | 'THEM'>('USER')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setLoading(true)

    try {
      const response = await fetch(`/api/connections/${connectionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sender }),
      })

      if (!response.ok) {
        throw new Error('Failed to add message')
      }

      setContent('')
      router.refresh()
    } catch (error) {
      console.error('Error adding message:', error)
      alert('Failed to add message')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="message-content">Add Message</Label>
        <Textarea
          id="message-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type your message here..."
          rows={4}
        />
      </div>

      <div className="flex gap-4">
        <Select value={sender} onValueChange={(v) => setSender(v as 'USER' | 'THEM')}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">From Me</SelectItem>
            <SelectItem value="THEM">From Them</SelectItem>
          </SelectContent>
        </Select>

        <Button type="submit" disabled={loading || !content.trim()}>
          {loading ? 'Adding...' : 'Add Message'}
        </Button>
      </div>
    </form>
  )
}