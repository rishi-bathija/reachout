import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

type ProfileBody = {
  yearsOfExp?: number | null
  techStack?: string
  targetRoles?: string
  introSummary?: string
  onboardingCompleted?: boolean
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        yearsOfExp: true,
        techStack: true,
        targetRoles: true,
        introSummary: true,
        onboardingCompleted: true,
      },
    })

    return NextResponse.json({ profile })
  } catch (error: unknown) {
    console.error('Error fetching profile:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as ProfileBody

    const years =
      typeof body.yearsOfExp === 'number' && Number.isFinite(body.yearsOfExp)
        ? Math.max(0, Math.floor(body.yearsOfExp))
        : null

    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        yearsOfExp: years,
        techStack: body.techStack?.trim() || null,
        targetRoles: body.targetRoles?.trim() || null,
        introSummary: body.introSummary?.trim() || null,
        onboardingCompleted: body.onboardingCompleted ?? false,
      },
      update: {
        yearsOfExp: years,
        techStack: body.techStack?.trim() || null,
        targetRoles: body.targetRoles?.trim() || null,
        introSummary: body.introSummary?.trim() || null,
        onboardingCompleted:
          typeof body.onboardingCompleted === 'boolean'
            ? body.onboardingCompleted
            : undefined,
      },
    })

    return NextResponse.json({ profile })
  } catch (error: unknown) {
    console.error('Error saving profile:', error)
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 })
  }
}
