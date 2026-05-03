import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'

type ParsedMessage = {
  sender: 'USER' | 'THEM'
  content: string
  dateLabel?: string
  timeMinutes?: number
}

const HEADER_WITH_PRONOUNS = /^(.+?)\s+\(([^)]+)\)\s+\d{1,2}:\d{2}\s*(AM|PM)$/i
const HEADER_SIMPLE = /^(.+?)\s+\d{1,2}:\d{2}\s*(AM|PM)$/i
const DATE_SEPARATOR =
  /^(Today|Yesterday|Mon(day)?|Tue(sday)?|Wed(nesday)?|Thu(rsday)?|Fri(day)?|Sat(urday)?|Sun(day)?|Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|Jun(e)?|Jul(y)?|Aug(ust)?|Sep(tember)?|Sept(ember)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)(\s+\d{1,2})?$/i
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

function splitCompareTokens(value: string): string[] {
  return normalizeForCompare(value).split(/\s+/).filter(Boolean)
}

function tokenMatch(value: string, reference: string): boolean {
  const valueTokens = splitCompareTokens(value)
  const referenceTokens = splitCompareTokens(reference)
  if (!valueTokens.length || !referenceTokens.length) return false
  return referenceTokens.every((token) => valueTokens.includes(token))
}

function normalizeContent(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const ampm = match[3].toUpperCase()
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  let normalizedHours = hours % 12
  if (ampm === 'PM') normalizedHours += 12
  return normalizedHours * 60 + minutes
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

  if (normalizedName && normalizedConnection && tokenMatch(normalizedName, normalizedConnection)) {
    return 'THEM'
  }

  for (const alias of userAliases) {
    if (alias && tokenMatch(normalizedName, alias)) {
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
  let currentDateLabel: string | null = null
  let pendingDateLabel: string | null = null
  let currentTimeMinutes: number | null = null

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
      dateLabel: currentDateLabel || undefined,
      timeMinutes: currentTimeMinutes ?? undefined,
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

    if (DATE_SEPARATOR.test(trimmed)) {
      pendingDateLabel = trimmed
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
        currentTimeMinutes = parseTimeToMinutes(trimmed)
        if (pendingDateLabel) {
          currentDateLabel = pendingDateLabel
          pendingDateLabel = null
        }
        continue
      }
    }

    if (!currentSpeaker) {
      continue
    }

    currentContent.push(line)
  }

  flush()
  if (messages.length <= 2) return messages

  if (!messages[0]?.dateLabel) {
    const firstDated = messages.find((msg) => msg.dateLabel)
    if (firstDated?.dateLabel) {
      for (const msg of messages) {
        if (msg.dateLabel) break
        msg.dateLabel = firstDated.dateLabel
      }
    }
  }

  const grouped: ParsedMessage[][] = []
  for (const msg of messages) {
    const lastGroup = grouped[grouped.length - 1]
    if (!lastGroup) {
      grouped.push([msg])
      continue
    }
    const lastLabel = lastGroup[0]?.dateLabel ?? null
    const label = msg.dateLabel ?? null
    if (lastLabel === label) {
      lastGroup.push(msg)
    } else {
      grouped.push([msg])
    }
  }

  const normalized: ParsedMessage[] = []
  for (const group of grouped) {
    let ascending = 0
    let descending = 0
    for (let i = 1; i < group.length; i += 1) {
      const prev = group[i - 1].timeMinutes
      const next = group[i].timeMinutes
      if (typeof prev !== 'number' || typeof next !== 'number') continue
      if (prev <= next) ascending += 1
      if (prev >= next) descending += 1
    }
    if (descending > ascending) {
      normalized.push(...group.slice().reverse())
    } else {
      normalized.push(...group)
    }
  }

  return normalized
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

    let body: unknown
    try {
      body = await request.json()
    } catch (error: unknown) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const transcript = typeof (body as any).transcript === 'string' ? (body as any).transcript.trim() : ''
    if (!transcript) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    // console.log('transcript', transcript);

    const aliasesRaw = typeof (body as any).userAliases === 'string' ? (body as any).userAliases : ''

    // console.log('userAliases', aliasesRaw);

    const aliases = aliasesRaw
      .split(',')
      .map((v: string) => v.trim())
      .filter(Boolean)

    // console.log('userAliases', aliases);

    const parsed = parseLinkedInTranscript((body as any).transcript, connection.name, aliases)

    // console.log('parsed', parsed);

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

    // console.log('existingMessages', existingMessages);
    
    const existingSet = new Set(
      existingMessages.map((m: { sender: string; content: string }) => `${m.sender}::${normalizeContent(m.content)}`)
    )

    // console.log('existingSet', existingSet);

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
    
    // console.log('toInsert', toInsert);

    if (toInsert.length > 0) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const maxOrder = await tx.message.aggregate({
          where: { connectionId: connection.id },
          _max: { orderIndex: true },
        })

        const baseOrderIndex =
          typeof maxOrder._max.orderIndex === 'number' ? maxOrder._max.orderIndex : -1

          // console.log('baseOrderIndex', baseOrderIndex);
          
        await tx.message.createMany({
          data: toInsert.map((msg, index) => ({
            connectionId: connection.id,
            sender: msg.sender,
            content: msg.content,
            orderIndex: baseOrderIndex + index + 1,
          })),
        })
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
