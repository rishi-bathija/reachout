import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserIdFromExtensionAuth } from '@/lib/extension/auth'

function normalizeProfileUrl(raw: string) {
  try {
    const url = new URL(raw)
    const pathname = url.pathname.replace(/\/$/, '')
    return `${url.origin}${pathname}`
  } catch {
    return ''
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromExtensionAuth(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      acceptances?: Array<{ name?: string; company?: string; profileUrl?: string }>
    }

    const acceptances = Array.isArray(body.acceptances) ? body.acceptances : []
    console.log('[ReachOutFlow] Acceptances payload', { userId, count: acceptances.length })
    if (acceptances.length === 0) {
      return NextResponse.json({ updated: 0, matched: 0 })
    }

    let matched = 0
    let updated = 0
    const matchedConnections: Array<{
      id: string
      name: string
      profileUrl: string | null
    }> = []

    for (const acceptance of acceptances) {
      console.log('[ReachOutFlow] Matching acceptance', acceptance)
      const rawUrl = acceptance.profileUrl?.trim() || ''
      const normalizedUrl = normalizeProfileUrl(rawUrl)

      let connection = null

      if (normalizedUrl) {
        const altUrl = normalizedUrl.endsWith('/')
          ? normalizedUrl.slice(0, -1)
          : `${normalizedUrl}/`

        connection = await prisma.connection.findFirst({
          where: {
            userId,
            OR: [
              { profileUrl: { equals: normalizedUrl, mode: 'insensitive' } },
              { profileUrl: { equals: altUrl, mode: 'insensitive' } },
            ],
          },
        })
      }

      if (!connection) {
        const name = acceptance.name?.trim()
        const company = acceptance.company?.trim()
        if (name && company) {
          connection = await prisma.connection.findFirst({
            where: {
              userId,
              name: { equals: name, mode: 'insensitive' },
              company: { equals: company, mode: 'insensitive' },
            },
          })
        }
      }

      if (connection) {
        matched += 1
        matchedConnections.push({
          id: connection.id,
          name: connection.name,
          profileUrl: connection.profileUrl,
        })
        if (connection.status !== 'CONNECTED') {
          await prisma.connection.update({
            where: { id: connection.id },
            data: {
              status: 'CONNECTED',
              dateAccepted: connection.dateAccepted || new Date(),
            },
          })
          updated += 1
        }
      }
    }

    return NextResponse.json({ updated, matched, matchedConnections })
  } catch (error: unknown) {
    console.error('Error processing acceptances:', error)
    return NextResponse.json({ error: 'Failed to process acceptances' }, { status: 500 })
  }
}
