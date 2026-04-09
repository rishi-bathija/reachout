'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STATUSES = ['PENDING', 'ACCEPTED', 'MESSAGED', 'RESPONDED']

export default function StatusUpdateForm({
  connectionId,
  currentStatus,
}: {
  connectionId: string
  currentStatus: string
}) {
  const [status, setStatus] = useState(currentStatus)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setStatus(currentStatus)
  }, [currentStatus])

  const handleUpdate = async () => {
    if (status === currentStatus) return

    setLoading(true)

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      router.refresh()
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-4 items-center">
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button 
        onClick={handleUpdate} 
        disabled={loading || status === currentStatus}
      >
        {loading ? 'Updating...' : 'Update Status'}
      </Button>
    </div>
  )
}