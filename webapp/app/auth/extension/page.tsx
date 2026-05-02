'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function ExtensionLinkContent() {
  const searchParams = useSearchParams()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const [status, setStatus] = useState<'idle' | 'sent' | 'copied' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Missing token')
      setStatus('error')
      return
    }

    window.postMessage({ type: 'REACHOUTFLOW_EXTENSION_TOKEN', token }, window.location.origin)
    setStatus('sent')
  }, [token])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setStatus('copied')
    } catch (err: unknown) {
      setError('Failed to copy token')
      setStatus('error')
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Extension Link</CardTitle>
            <CardDescription>Missing token.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Connect Extension</CardTitle>
          <CardDescription>
            Keep this tab open while you confirm in the extension.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'sent' && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Token sent to the extension. If it did not connect, copy the token below.
            </div>
          )}
          {status === 'copied' && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Token copied. Paste it in the extension.
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error || 'Something went wrong'}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">Link Token</div>
            <div className="rounded-md border bg-white px-3 py-2 text-xs break-all">
              {token}
            </div>
          </div>

          <Button onClick={handleCopy} variant="outline">
            Copy Token
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ExtensionLinkFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Extension</CardTitle>
          <CardDescription>Preparing secure link token...</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function ExtensionLinkPage() {
  return (
    <Suspense fallback={<ExtensionLinkFallback />}>
      <ExtensionLinkContent />
    </Suspense>
  )
}
