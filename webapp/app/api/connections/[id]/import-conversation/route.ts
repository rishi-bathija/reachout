import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

type ParsedMessage = {
  sender: 'USER' | 'THEM'
  content: string
}

const HEADER_WITH_PRONOUNS = /^(.+?)\s+\(([^)]+)\)\s+\d{1,2}:\d{2}\s*(AM|PM)$/i
const HEADER_SIMPLE = /^(.+?)\s+\d{1,2}:\d{2}\s*(AM|PM)$/i
const DATE_SEPARATOR = /^(Today|Yesterday|[A-Za-z]{3}\s+\d{1,2})$/i
const SEEN_BY_LINE = /^\(?Seen by .+ at \d{1,2}:\d{2}\s*(AM|PM)\.?\)?$/i

function isEmojiOnlyLine(line: string): boolean {
  if (!line.trim()) return false
  const hasEmoji = /\p{Extended_Pictographic}/u.test(line)
  if (!hasEmoji) return false

  const stripped = line
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\s.,!?'"`~^*_+=\-:;()[\]{}<>|\\/]/g, '')

  return stripped.length === 0
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeContent(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function isNoiseLine(line: string): boolean {
  if (!line.trim()) return false
  if (DATE_SEPARATOR.test(line.trim())) return true
  if (/^View .+ profile/i.test(line.trim())) return true
  if (/ sent the following message/i.test(line.trim())) return true
  if (/ sent the following messages/i.test(line.trim())) return true
  if (/^\d+\s*KB$/i.test(line.trim())) return true
  if (/^Download$/i.test(line.trim())) return true
  if (/^\(Edited\)$/i.test(line.trim())) return true
  if (SEEN_BY_LINE.test(line.trim())) return true
  if (isEmojiOnlyLine(line.trim())) return true
  if (/^[^\s]+\.(pdf|doc|docx|zip|jpg|jpeg|png)$/i.test(line.trim())) return true
  return false
}

function resolveSpeaker(
  rawName: string,
  connectionName: string,
  userAliases: string[],
  unknownMap: Map<string, 'USER' | 'THEM'>
): 'USER' | 'THEM' {
  const normalizedName = normalizeForCompare(rawName)
  const normalizedConnection = normalizeForCompare(connectionName)

  if (normalizedName && normalizedConnection && normalizedName.includes(normalizedConnection)) {
    return 'THEM'
  }

  for (const alias of userAliases) {
    const normalizedAlias = normalizeForCompare(alias)
    if (normalizedAlias && normalizedName.includes(normalizedAlias)) {
      return 'USER'
    }
  }

  const existing = unknownMap.get(normalizedName)
  if (existing) return existing

  const hasAssignedUser = Array.from(unknownMap.values()).includes('USER')
  const assigned: 'USER' | 'THEM' = hasAssignedUser ? 'THEM' : 'USER'
  unknownMap.set(normalizedName, assigned)
  return assigned
}

function parseLinkedInTranscript(
  transcript: string,
  connectionName: string,
  userAliases: string[]
): ParsedMessage[] {
  const lines = transcript.replace(/\r\n/g, '\n').split('\n')
  const messages: ParsedMessage[] = []
  const unknownMap = new Map<string, 'USER' | 'THEM'>()

  let currentSpeaker: 'USER' | 'THEM' | null = null
  let currentContent: string[] = []

  const flush = () => {
    if (!currentSpeaker) return
    const content = currentContent.join('\n').trim()
    if (!content) {
      currentContent = []
      return
    }

    messages.push({
      sender: currentSpeaker,
      content,
    })
    currentContent = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      if (currentContent.length > 0 && currentContent[currentContent.length - 1] !== '') {
        currentContent.push('')
      }
      continue
    }

    if (isNoiseLine(trimmed)) {
      continue
    }

    const withPronounsMatch = trimmed.match(HEADER_WITH_PRONOUNS)
    const simpleMatch = trimmed.match(HEADER_SIMPLE)
    const headerMatch = withPronounsMatch ?? simpleMatch

    if (headerMatch) {
      const candidateName = headerMatch[1]?.trim() ?? ''
      if (candidateName) {
        flush()
        currentSpeaker = resolveSpeaker(candidateName, connectionName, userAliases, unknownMap)
        continue
      }
    }

    if (!currentSpeaker) {
      continue
    }

    currentContent.push(line)
  }

  flush()
  return messages
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const connection = await prisma.connection.findUnique({
      where: { id, userId: user.id },
      select: { id: true, name: true },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const body = (await request.json()) as {
      transcript?: string
      userAliases?: string
    }

    if (!body.transcript || !body.transcript.trim()) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    const aliases = (body.userAliases ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)

    const parsed = parseLinkedInTranscript(body.transcript, connection.name, aliases)
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: 'No messages could be parsed. Check transcript format.' },
        { status: 400 }
      )
    }

    const existingMessages = await prisma.message.findMany({
      where: { connectionId: connection.id },
      select: { sender: true, content: true },
    })

    const existingSet = new Set(
      existingMessages.map((m) => `${m.sender}::${normalizeContent(m.content)}`)
    )

    const toInsert: ParsedMessage[] = []
    let skippedDuplicates = 0
    for (const msg of parsed) {
      const key = `${msg.sender}::${normalizeContent(msg.content)}`
      if (existingSet.has(key)) {
        skippedDuplicates += 1
        continue
      }
      existingSet.add(key)
      toInsert.push(msg)
    }

    if (toInsert.length > 0) {
      const maxOrder = await prisma.message.aggregate({
        where: { connectionId: connection.id },
        _max: { orderIndex: true },
      })

      const baseOrderIndex =
        typeof maxOrder._max.orderIndex === 'number' ? maxOrder._max.orderIndex : -1

      await prisma.message.createMany({
        data: toInsert.map((msg, index) => ({
          connectionId: connection.id,
          sender: msg.sender,
          content: msg.content,
          orderIndex: baseOrderIndex + index + 1,
        })),
      })
    }

    return NextResponse.json({
      parsedCount: parsed.length,
      insertedCount: toInsert.length,
      skippedDuplicates,
    })
  } catch (error: unknown) {
    console.error('Error importing conversation:', error)
    return NextResponse.json(
      { error: 'Failed to import conversation' },
      { status: 500 }
    )
  }
}
