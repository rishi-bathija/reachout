import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { generateNetworkMessage, VARIATION_PROMPTS } from '@/lib/ai/network-message'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey =
      process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'AI service not configured. Add GEMINI_API_KEY to environment variables.',
          },
        },
        { status: 500 }
      )
    }

    const { id } = await params
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
      },
    })

    const connection = await prisma.connection.findUnique({
      where: { id, userId: user.id },
      select: {
        id: true,
        name: true,
        company: true,
        role: true,
        jobTitle: true,
        jobUrl: true,
        notes: true,
      },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const body = (await request.json()) as { variation?: string }
    const variation = body.variation && VARIATION_PROMPTS[body.variation] ? body.variation : 'balanced'

    const generated = await generateNetworkMessage({
      apiKey,
      profile,
      connection,
      variation,
    })

    if (!generated.ok) {
      return NextResponse.json({ error: generated.error }, { status: generated.status })
    }

    const generatedMessage = await prisma.generatedMessage.create({
      data: {
        connectionId: connection.id,
        message: generated.text,
      },
    })

    return NextResponse.json({ generatedMessage })
  } catch (error: unknown) {
    console.error('Error generating message:', error)
    return NextResponse.json(
      { error: 'Failed to generate message' },
      { status: 500 }
    )
  }
}
