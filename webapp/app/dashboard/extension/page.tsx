'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ExtensionLinkPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLink = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/extension/link-token', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create link token')
      }

      if (!data.token) {
        throw new Error('Missing token from server')
      }

      window.location.href = `/auth/extension?token=${encodeURIComponent(data.token)}`
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Connect Extension</CardTitle>
          <CardDescription>
            Generate a one-time link token and pair your browser extension.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <Button onClick={handleLink} disabled={loading}>
            {loading ? 'Generating Link...' : 'Generate Link Token'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
