import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { mapGeminiError } from '@/lib/ai/gemini-error'
import { fetchGeminiWithRetry } from '@/lib/ai/gemini-fetch'

const TONE_PROMPTS: Record<string, string> = {
  professional: 'Professional, concise, and respectful.',
  friendly: 'Friendly, warm, and conversational.',
  direct: 'Direct, short, and action-oriented.',
}

const SPLIT_TOKEN = '<<<SPLIT>>>'
const BAD_PERSPECTIVE_PATTERNS = [
  /thanks for your interest/i,
  /please share (your )?(cv|resume)/i,
  /we are looking for/i,
  /our hiring process/i,
  /from our side/i,
]

type ReplyMode = 'auto' | 'reply' | 'follow_up'
type EffectiveReplyMode = 'reply' | 'follow_up'

function parseSuggestions(rawText: string): string[] {
  return rawText
    .split(SPLIT_TOKEN)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
}

function looksWrongPerspective(suggestions: string[]): boolean {
  return suggestions.some((suggestion) =>
    BAD_PERSPECTIVE_PATTERNS.some((pattern) => pattern.test(suggestion))
  )
}

async function generateWithGemini(apiKey: string, prompt: string): Promise<{
  ok: true
  text: string
} | {
  ok: false
  status: number
  error: unknown
}> {
  try {
    const geminiResponse = await fetchGeminiWithRetry({
      apiKey,
      prompt,
    })

    if (!geminiResponse.ok) {
      const mapped = await mapGeminiError(geminiResponse)
      return { ok: false, status: mapped.status, error: mapped.error }
    }

    const result = (await geminiResponse.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const rawText = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('\n')
      .trim()

    if (!rawText) {
      return {
        ok: false,
        status: 502,
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'AI returned an empty response. Please retry.',
        },
      }
    }

    return { ok: true, text: rawText }
  } catch (error: unknown) {
    const isAbort = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      error: isAbort
        ? { code: 'TIMEOUT', message: 'AI request timed out. Please retry.' }
        : error,
    }
  }
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
            code: 'CONFIGURATION_ERROR',
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

    let body: { tone?: string; mode?: ReplyMode } = {}
    try {
      body = (await request.json()) as { tone?: string; mode?: ReplyMode }
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
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
        notes: true,
        messages: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          take: 80,
          select: {
            sender: true,
            content: true,
            createdAt: true,
            orderIndex: true,
          },
        },
      },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const tone = body.tone && TONE_PROMPTS[body.tone] ? body.tone : 'professional'
    const requestedMode: ReplyMode =
      body.mode === 'reply' || body.mode === 'follow_up' || body.mode === 'auto'
        ? body.mode
        : 'auto'

    const recentWindow = connection.messages.slice(-24)
    const conversation = recentWindow
      .map((message) => `${message.sender}: ${message.content}`)
      .join('\n')

    const latestMessage = recentWindow.at(-1)

    const effectiveMode: EffectiveReplyMode =
      requestedMode === 'auto'
        ? latestMessage?.sender === 'THEM'
          ? 'reply'
          : 'follow_up'
        : requestedMode

    const latestUserMessage = [...recentWindow]
      .reverse()
      .find((message) => message.sender === 'USER')?.content

    const latestThemMessage = [...recentWindow]
      .reverse()
      .find((message) => message.sender === 'THEM')?.content

    const resumeRequested = recentWindow.some(
      (message) => message.sender === 'THEM' && /(resume|cv)\b/i.test(message.content)
    )
    const resumeShared = recentWindow.some(
      (message) =>
        message.sender === 'USER' &&
        /(resume|cv)\b/i.test(message.content) &&
        /(attached|here is|here's|please find|resume\.pdf|\.pdf)\b/i.test(message.content)
    )

    const intentInstruction =
      effectiveMode === 'reply'
        ? 'Generate a direct reply to the latest THEM message.'
        : 'Generate a polite follow-up from USER to nudge for an update.'

    const followUpDirectives =
      effectiveMode === 'follow_up'
        ? [
            'Assume there has been no reply since the last USER message.',
            'Do NOT respond to any prior THEM message. This is a follow-up after silence.',
            'Keep it short, polite, and focused on the next step.',
            (resumeRequested || resumeShared)
              ? 'Offer to resend resume or clarify details if needed.'
              : '',
          ]
        : []

    const followUpContext =
      effectiveMode === 'follow_up'
        ? [
            'Follow-up context summary (for reference, not a reply target):',
            connection.jobTitle
              ? connection.company ? `- Target job: ${connection.jobTitle} at ${connection.company}` : `- Target job: ${connection.jobTitle}`
              : connection.company ? `- Company: ${connection.company}` : '',
            latestUserMessage ? `- Last USER action: ${latestUserMessage}` : '',
            latestThemMessage ? `- Last THEM response: ${latestThemMessage}` : '',
            '- Status: No reply since then.',
          ]
            .filter(Boolean)
            .join('\n')
        : ''

    const basePrompt = [
      'You are helping draft LinkedIn replies.',
      `Write 3 reply options to send next. Tone: ${TONE_PROMPTS[tone]}`,
      intentInstruction,
      ...followUpDirectives,
      'You are drafting text for USER to send.',
      'Always write in first-person from USER perspective.',
      'Never write as the recipient or recruiter.',
      'Keep each option under 80 words and specific to context.',
      'Do not include placeholders or brackets.',
      profile?.yearsOfExp !== null && profile?.yearsOfExp !== undefined
        ? `USER years of experience: ${profile.yearsOfExp}`
        : '',
      profile?.techStack ? `USER tech stack: ${profile.techStack}` : '',
      profile?.targetRoles ? `USER target roles: ${profile.targetRoles}` : '',
      profile?.introSummary ? `USER profile summary: ${profile.introSummary}` : '',
      `Recipient: ${connection.name}`,
      `Recipient role/company: ${connection.role} at ${connection.company}`,
      connection.jobTitle ? `Target job: ${connection.jobTitle}` : '',
      connection.notes ? `User notes: ${connection.notes}` : '',
      effectiveMode === 'reply' && latestThemMessage
        ? `Latest THEM message:\n${latestThemMessage}`
        : '',
      latestUserMessage ? `Latest USER message:\n${latestUserMessage}` : '',
      followUpContext,
      effectiveMode === 'reply'
        ? conversation
          ? `Conversation history:\n${conversation}`
          : 'No prior messages yet.'
        : '',
      `Return exactly 3 options separated by ${SPLIT_TOKEN}.`,
      'Return only the 3 options text with separators; no headings.',
    ]
      .filter(Boolean)
      .join('\n\n')

    const firstAttempt = await generateWithGemini(apiKey, basePrompt)
    
    if (!firstAttempt.ok) {
      return NextResponse.json({ error: firstAttempt.error }, { status: firstAttempt.status })
    }

    let suggestions = parseSuggestions(firstAttempt.text)
    
    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse reply suggestions from model output.' },
        { status: 502 }
      )
    }

    if (looksWrongPerspective(suggestions)) {
      const retryPrompt = `${basePrompt}\n\nHard rule: Do not write as recruiter. Do not ask USER to share CV.`
      const secondAttempt = await generateWithGemini(apiKey, retryPrompt)
      if (!secondAttempt.ok) {
        return NextResponse.json({ error: secondAttempt.error }, { status: secondAttempt.status })
      }
      const retried = parseSuggestions(secondAttempt.text)
      if (retried.length > 0) {
        suggestions = retried
      }
    }

    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse reply suggestions from model output.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ suggestions, effectiveMode })
  } catch (error: unknown) {
    console.error('Error generating reply suggestions:', error)
    return NextResponse.json(
      { error: 'Failed to generate reply suggestions' },
      { status: 500 }
    )
  }
}
