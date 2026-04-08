'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type Props = {
  initialProfile: {
    introSummary: string
    yearsOfExp: number | null
    techStack: string
    targetRoles: string
  }
}

export default function ProfileForm({ initialProfile }: Props) {
  const [introSummary, setIntroSummary] = useState(initialProfile.introSummary)
  const [yearsOfExp, setYearsOfExp] = useState(
    initialProfile.yearsOfExp !== null ? String(initialProfile.yearsOfExp) : ''
  )
  const [techStack, setTechStack] = useState(initialProfile.techStack)
  const [targetRoles, setTargetRoles] = useState(initialProfile.targetRoles)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const parsedYears =
        yearsOfExp.trim() === '' ? null : Number.parseInt(yearsOfExp.trim(), 10)
      if (yearsOfExp.trim() !== '' && Number.isNaN(parsedYears)) {
        throw new Error('Experience must be a valid number')
      }

      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          introSummary,
          yearsOfExp: parsedYears,
          techStack,
          targetRoles,
          onboardingCompleted: true,
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to update profile')
      }

      setSuccess('Profile updated successfully.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Profile</CardTitle>
        <CardDescription>
          Update your profile details to improve AI personalization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="introSummary">Profile Summary</Label>
            <Textarea
              id="introSummary"
              rows={6}
              value={introSummary}
              onChange={(e) => setIntroSummary(e.target.value)}
              placeholder="Tell us about your experience, strengths, and what kind of role you are seeking."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="techStack">Tech Stack</Label>
            <Input
              id="techStack"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              placeholder="React, Next.js, TypeScript, Node.js"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="yearsOfExp">Experience (Years)</Label>
            <Input
              id="yearsOfExp"
              type="number"
              min={0}
              value={yearsOfExp}
              onChange={(e) => setYearsOfExp(e.target.value)}
              placeholder="2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetRoles">Target Roles</Label>
            <Input
              id="targetRoles"
              value={targetRoles}
              onChange={(e) => setTargetRoles(e.target.value)}
              placeholder="Frontend Engineer, Full-stack Engineer"
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
