'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Info } from 'lucide-react'

type ExistingConnection = {
  id: string
  name: string
  company: string
  jobTitle: string | null
  jobUrl: string | null
  notes: string | null
}

export default function AddConnectionPage() {
  const [formData, setFormData] = useState({
    name: '',
    profileUrl: '',
    company: '',
    role: '',
    jobUrl: '',
    jobTitle: '',
    notes: '',
    connectionSentAt: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingConnections, setExistingConnections] = useState<ExistingConnection[]>([])
  const [selectedSource, setSelectedSource] = useState<ExistingConnection | null>(null)
  const [showSuggestion, setShowSuggestion] = useState(false)
  const router = useRouter()

  // Debounced company search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.company.trim().length >= 2) {
        fetchExistingConnections(formData.company.trim())
      } else {
        setExistingConnections([])
        setShowSuggestion(false)
      }
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [formData.company])

  const fetchExistingConnections = async (company: string) => {
    try {
      const response = await fetch(`/api/connections?company=${encodeURIComponent(company)}`)
      if (response.ok) {
        const data = await response.json()
        const connections = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
            ? data.data
            : (data.items || [])
        if (connections.length > 0) {
          setExistingConnections(connections)
          setShowSuggestion(true)
        } else {
          setExistingConnections([])
          setShowSuggestion(false)
        }
      }
    } catch (err) {
      console.error('Error fetching existing connections:', err)
    }
  }

  const handleUsePreviousConnection = (connection: ExistingConnection) => {
    setSelectedSource(connection)
    setFormData({
      ...formData,
      jobUrl: connection.jobUrl || '',
      jobTitle: connection.jobTitle || '',
      notes: connection.notes || '',
    })
    setShowSuggestion(false)
  }


  const handleClearSource = () => {
    setSelectedSource(null)
    setFormData({
      ...formData,
      jobUrl: '',
      jobTitle: '',
      notes: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = selectedSource
        ? {
          name: formData.name,
          profileUrl: formData.profileUrl,
          role: formData.role,
          sourceConnectionId: selectedSource.id, // Backend will copy details
        }
        : formData // Full manual entry

      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add connection')
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  console.log('showsuggestion',showSuggestion);
  console.log('existingconnection',existingConnections);
    
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Add New Connection</CardTitle>
          <CardDescription>
            Track a new LinkedIn connection request
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profileUrl">LinkedIn Profile URL</Label>
              <Input
                id="profileUrl"
                type="url"
                value={formData.profileUrl}
                onChange={(e) => setFormData({ ...formData, profileUrl: e.target.value })}
                placeholder="https://linkedin.com/in/johndoe"
              />
            </div>

            {/* <div className="grid grid-cols-2 gap-4"> */}
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Input
                id="company"
                required={!selectedSource} // Required if no source connection selected
                disabled={!!selectedSource} // Disable if source connection selected
                value={selectedSource ? selectedSource.company : formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Google"
              />
              {selectedSource && (
                <p className="text-sm text-gray-500">
                  Using details from previous connection
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={handleClearSource}
                    className="ml-2 h-auto p-0"
                  >
                    Clear
                  </Button>
                </p>
              )}
            </div>

            {showSuggestion && existingConnections.length > 0 && !selectedSource && (
              <Alert>
                <Copy className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-2">
                    Found {existingConnections.length} previous connection{existingConnections.length > 1 ? 's' : ''} at {formData.company}
                  </p>
                  <div className="space-y-2">
                    {existingConnections.map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center justify-between p-2 bg-white rounded border"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{conn.name} ({conn.company})</div>
                          {conn.jobTitle && (
                            <div className="text-gray-600">Applied for: {conn.jobTitle}</div>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleUsePreviousConnection(conn)}
                        >
                          Use Details
                        </Button>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="role">Their Role *</Label>
              <Input
                id="role"
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="Engineering Manager"
              />
            </div>
            {/* </div> */}

            {!selectedSource && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="jobUrl">Job Posting URL</Label>
                  <Input
                    id="jobUrl"
                    type="url"
                    value={formData.jobUrl}
                    onChange={(e) => setFormData({ ...formData, jobUrl: e.target.value })}
                    placeholder="https://company.com/careers/123"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jobTitle">Job Title You&apos;re Applying For</Label>
                  <Input
                    id="jobTitle"
                    value={formData.jobTitle}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    placeholder="Senior Full Stack Engineer"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Any additional context about this connection..."
                    rows={3}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="connectionSentAt">Connection Request Sent At (Optional)</Label>
              <Input
                id="connectionSentAt"
                type="datetime-local"
                value={formData.connectionSentAt}
                onChange={(e) => setFormData({ ...formData, connectionSentAt: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Use this if you are adding an older connection so timeline stays accurate.
              </p>
            </div>

            {/* Show what will be copied if source selected */}
            {selectedSource && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-2">Details from {selectedSource.name}:</p>
                  <ul className="text-sm space-y-1">
                    <li>Company: {selectedSource.company}</li>
                    {selectedSource.jobTitle && <li>Job: {selectedSource.jobTitle}</li>}
                    {selectedSource.jobUrl && (
                      <li>
                        <a href={selectedSource.jobUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          View
                        </a>
                      </li>
                    )}
                    {selectedSource.notes && <li>Notes: {selectedSource.notes}</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Adding...' : 'Add Connection'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dashboard')}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
