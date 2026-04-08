'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type Step = 1 | 2

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1)
  const [yearsOfExp, setYearsOfExp] = useState('')
  const [techStack, setTechStack] = useState('')
  const [targetRoles, setTargetRoles] = useState('')
  const [introSummary, setIntroSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const saveProfile = async (payload: {
    introSummary?: string
    yearsOfExp?: number | null
    techStack?: string
    targetRoles?: string
    onboardingCompleted: boolean
  }) => {
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await response.json()) as { error?: string }
    if (!response.ok) {
      throw new Error(data.error ?? 'Failed to save profile')
    }
  }

  const handleContinueToStep2 = () => {
    if (!introSummary.trim()) {
      setError('Please add your profile summary to continue.')
      return
    }
    setError('')
    setStep(2)
  }

  const parseYearsOfExp = () => {
    const parsedYears =
      yearsOfExp.trim() === '' ? null : Number.parseInt(yearsOfExp.trim(), 10)

    if (yearsOfExp.trim() !== '' && Number.isNaN(parsedYears)) {
      throw new Error('Experience must be a valid number')
    }

    return parsedYears
  }

  const handleSkipStep2 = async () => {
    if (!introSummary.trim()) {
      setError('Profile summary is required.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await saveProfile({
        introSummary: introSummary.trim(),
        yearsOfExp: null,
        techStack: '',
        targetRoles: '',
        onboardingCompleted: true,
      })

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to skip step 2')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!introSummary.trim()) {
      setError('Profile summary is required.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const parsedYears = parseYearsOfExp()

      await saveProfile({
        introSummary: introSummary.trim(),
        yearsOfExp: parsedYears,
        techStack: techStack.trim(),
        targetRoles: targetRoles.trim(),
        onboardingCompleted: true,
      })

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-2xl px-4">
        <Card>
          <CardHeader>
            <CardTitle>
              {step === 1 ? 'Step 1: Tell us about yourself' : 'Step 2: Help us personalize better'}
            </CardTitle>
            <CardDescription>
              {step === 1
                ? 'Add a short profile summary for better AI personalization.'
                : 'Optional details to improve message quality.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {step === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="introSummary">Profile Summary (required)</Label>
                  <Textarea
                    id="introSummary"
                    rows={8}
                    value={introSummary}
                    onChange={(e) => setIntroSummary(e.target.value)}
                    placeholder="Example: I am a full-stack engineer with 2 years of experience building production web apps with React, Next.js, TypeScript, Node.js, and PostgreSQL. I am currently targeting frontend/full-stack roles where I can contribute to product development and user-focused features."
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" disabled={loading} onClick={handleContinueToStep2}>
                    Continue to Step 2
                  </Button>
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleComplete}>
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

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading}>
                    Back
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSkipStep2} disabled={loading}>
                    Skip Step 2
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : 'Complete Profile'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
