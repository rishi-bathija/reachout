import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { mapGeminiError } from '@/lib/ai/gemini-error'

function sanitizePromptField(value?: string) {
  if (!value) return ''
  return value
    .replace(/###|Output:|System:|User:|Assistant:/gi, '')
    .replace(/\r\n|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

const VARIATION_PROMPTS: Record<string, string> = {
  balanced: 'Balanced, professional, concise.',
  short: 'Very short and crisp. Keep it under 70 words.',
  casual: 'Casual and direct, like you would message a friend. Still keep it professional.',
  warm: 'Friendly and warm while staying professional.',
  follow_up: 'Focus on follow-up intent and asking for a quick next step.',
}

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

    const prompt = [
      'Write a personalized LinkedIn message for networking/job referral outreach.',
      'Keep it natural and specific. Avoid generic buzzwords.',
      `Style: ${VARIATION_PROMPTS[variation]}`,
      `Recipient name: ${sanitizePromptField(connection.name)}`,
      `Recipient role: ${sanitizePromptField(connection.role)}`,
      `Recipient company: ${sanitizePromptField(connection.company)}`,
      profile?.yearsOfExp !== null && profile?.yearsOfExp !== undefined
        ? `My years of experience: ${profile.yearsOfExp}`
        : '',
      profile?.techStack ? `My tech stack: ${sanitizePromptField(profile.techStack)}` : '',
      profile?.targetRoles ? `My target roles: ${sanitizePromptField(profile.targetRoles)}` : '',
      profile?.introSummary ? `My profile summary: ${sanitizePromptField(profile.introSummary)}` : '',
      connection.jobTitle ? `Target job title: ${sanitizePromptField(connection.jobTitle)}` : '',
      connection.jobUrl ? `Job link: ${sanitizePromptField(connection.jobUrl)}` : '',
      connection.notes ? `Context notes: ${sanitizePromptField(connection.notes)}` : '',
      'Output only the message text, no extra explanation.',
    ]
      .filter(Boolean)
      .join('\n')

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // generationConfig: {
          //   temperature: 0.8,
          //   maxOutputTokens: 500,
          // },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const mapped = await mapGeminiError(geminiResponse)
      return NextResponse.json({ error: mapped.error }, { status: mapped.status })
    }

    const result = (await geminiResponse.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const generatedText = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('\n')
      .trim()

    if (!generatedText) {
      return NextResponse.json(
        { error: 'Gemini returned an empty response.' },
        { status: 502 }
      )
    }

    const generatedMessage = await prisma.generatedMessage.create({
      data: {
        connectionId: connection.id,
        message: generatedText,
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
