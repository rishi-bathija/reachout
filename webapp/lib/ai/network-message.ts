import { fetchGeminiWithRetry } from '@/lib/ai/gemini-fetch'
import { mapGeminiError } from '@/lib/ai/gemini-error'

export const VARIATION_PROMPTS: Record<string, string> = {
  balanced: 'Balanced, professional, concise.',
  short: 'Very short and crisp. Keep it under 70 words.',
  casual: 'Casual and direct, like you would message a friend. Still keep it professional.',
  warm: 'Friendly and warm while staying professional.',
  follow_up: 'Focus on follow-up intent and asking for a quick next step.',
}

const DEFAULT_GENERATION_MODEL = process.env.GEMINI_MODEL_GENERATION || 'gemini-2.5-flash'
const DEFAULT_SUMMARY_MODEL = process.env.GEMINI_MODEL_SUMMARY || 'gemini-2.5-flash-lite'
const DIRECT_NOTES_CHAR_LIMIT = 1_200
const PROMPT_NOTES_CHAR_LIMIT = 1_500

type UserProfileContext = {
  yearsOfExp?: number | null
  techStack?: string | null
  targetRoles?: string | null
  introSummary?: string | null
} | null

type ConnectionContext = {
  id: string
  name: string
  company: string
  role: string
  jobTitle?: string | null
  jobUrl?: string | null
  notes?: string | null
}

function sanitizePromptField(value?: string | null, maxLength = 500) {
  if (!value) return ''
  return value
    .replace(/###|Output:|System:|User:|Assistant:/gi, '')
    .replace(/\r\n|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

async function summarizeNotesForPrompt(params: {
  apiKey: string
  rawNotes: string
}): Promise<string> {
  const normalizedNotes = sanitizePromptField(params.rawNotes, 8_000)
  if (!normalizedNotes) return ''

  if (normalizedNotes.length <= DIRECT_NOTES_CHAR_LIMIT) {
    return sanitizePromptField(normalizedNotes, PROMPT_NOTES_CHAR_LIMIT)
  }

  const summaryPrompt = [
    'Summarize the job/company/context notes into concise outreach context.',
    'Return plain text only. No markdown.',
    'Do not hallucinate. If detail is missing, skip it.',
    'Include only high-signal context for networking/referral outreach.',
    'Preferred sections in this exact order:',
    '1) Company and product context',
    '2) Role focus',
    '3) Key requirements (skills/experience)',
    '4) Candidate fit cues',
    '5) Suggested angle for outreach',
    'Keep the total under 900 characters.',
    `Raw notes:\n${normalizedNotes}`,
  ].join('\n')

  try {
    const summaryResponse = await fetchGeminiWithRetry({
      apiKey: params.apiKey,
      prompt: summaryPrompt,
      model: DEFAULT_SUMMARY_MODEL,
    })

    // console.log('summaryresponse', summaryResponse);
    
    if (!summaryResponse.ok) {
      return sanitizePromptField(normalizedNotes, PROMPT_NOTES_CHAR_LIMIT)
    }

    const summaryResult = (await summaryResponse.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const summaryText = summaryResult.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('\n')
      .trim()

    if (!summaryText) {
      return sanitizePromptField(normalizedNotes, PROMPT_NOTES_CHAR_LIMIT)
    }

    
    return sanitizePromptField(summaryText, PROMPT_NOTES_CHAR_LIMIT)
  } catch {
    return sanitizePromptField(normalizedNotes, PROMPT_NOTES_CHAR_LIMIT)
  }
}

export function buildNetworkMessagePrompt(
  profile: UserProfileContext,
  connection: ConnectionContext,
  variation: string,
  notesForPrompt?: string
) {
  const style = VARIATION_PROMPTS[variation] || VARIATION_PROMPTS.balanced
  return [
    'Write a personalized LinkedIn message for networking/job referral outreach.',
    'Keep it natural and specific. Avoid generic buzzwords.',
    `Style: ${style}`,
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
    notesForPrompt ? `Context notes: ${notesForPrompt}` : '',
    'Output only the message text, no extra explanation.',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generateNetworkMessage(params: {
  apiKey: string
  profile: UserProfileContext
  connection: ConnectionContext
  variation?: string
}) {
  const variation = params.variation && VARIATION_PROMPTS[params.variation] ? params.variation : 'balanced'
  const notesForPrompt = params.connection.notes
    ? await summarizeNotesForPrompt({
        apiKey: params.apiKey,
        rawNotes: params.connection.notes,
      })
    : ''
  const prompt = buildNetworkMessagePrompt(
    params.profile,
    params.connection,
    variation,
    notesForPrompt
  )

  const geminiResponse = await fetchGeminiWithRetry({
    apiKey: params.apiKey,
    prompt,
    model: DEFAULT_GENERATION_MODEL,
  })

  // console.log('geminiresponse', geminiResponse);
  
  if (!geminiResponse.ok) {
    const mapped = await mapGeminiError(geminiResponse)
    return {
      ok: false as const,
      status: mapped.status,
      error: mapped.error,
    }
  }

  const result = (await geminiResponse.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }

  const generatedText = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (!generatedText) {
    return {
      ok: false as const,
      status: 502,
      error: 'Gemini returned an empty response.',
    }
  }

  return {
    ok: true as const,
    variation,
    text: generatedText,
  }
}
