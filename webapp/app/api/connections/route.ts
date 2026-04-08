import { createClient } from '@/lib/supabase/server'
import { listConnectionsForUser } from '@/lib/connections/list'
import { prisma } from '@/lib/prisma'
import { getUserIdFromExtensionAuth } from '@/lib/extension/auth'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    // API: GET /api/connections
    // Query params:
    // - page (number, 1-based) or offset (number, 0-based) for pagination
    // - limit (number, default 20, max 100)
    // - sortBy (createdAt|updatedAt|dateSent|dateAccepted|nextFollowUpAt|lastContactedAt|name|company|role|status)
    // - sortDir (asc|desc)
    // - search (string keyword across name/company/role/jobTitle)
    // - company (legacy filter; defaults limit to 5 when used without search)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    console.log('searchparams', searchParams);
    

    const result = await listConnectionsForUser(user.id, {
      company: searchParams.get('company'),
      search: searchParams.get('search'),
      sortBy: searchParams.get('sortBy'),
      sortDir: searchParams.get('sortDir'),
      limit: searchParams.get('limit'),
      page: searchParams.get('page'),
      offset: searchParams.get('offset'),
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('Error fetching connections:', error)
    return NextResponse.json(
      { error: 'Failed to fetch connections' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const extensionUserId = user ? null : await getUserIdFromExtensionAuth(request)
    const userId = user?.id || extensionUserId

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      name?: string
      profileUrl?: string
      company?: string
      role?: string
      jobUrl?: string
      jobTitle?: string
      notes?: string
      connectionSentAt?: string
      lastContactedAt?: string
      sourceConnectionId?: string
    }

    const normalizeProfileUrl = (raw?: string) => {
      if (!raw) return ''
      try {
        const url = new URL(raw)
        const pathname = url.pathname.replace(/\/$/, '')
        return `${url.origin}${pathname}`
      } catch {
        return raw.trim()
      }
    }

    const normalizeCompany = (raw?: string) => {
      if (!raw) return ''
      const trimmed = raw.trim()
      return trimmed.split('·')[0]?.trim() || trimmed
    }

    let parsedDateSent: Date | undefined
    if (body.connectionSentAt && body.connectionSentAt.trim()) {
      const parsed = new Date(body.connectionSentAt)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid connection sent date/time' }, { status: 400 })
      }
      parsedDateSent = parsed
    }

    let parsedLastContactedAt: Date | undefined
    if (body.lastContactedAt && body.lastContactedAt.trim()) {
      const parsed = new Date(body.lastContactedAt)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid last contacted date/time' }, { status: 400 })
      }
      parsedLastContactedAt = parsed
    }

    const hasSource = Boolean(body.sourceConnectionId?.trim())
    if (!body.name?.trim() || !body.role?.trim()) {
      return NextResponse.json(
        { error: 'Name and role are required' },
        { status: 400 }
      )
    }

    if (!hasSource && !body.company?.trim()) {
      return NextResponse.json(
        { error: 'Name, company, and role are required' },
        { status: 400 }
      )
    }

    let sourceConnection: {
      company: string
      jobUrl: string | null
      jobTitle: string | null
      notes: string | null
    } | null = null

    if (hasSource) {
      sourceConnection = await prisma.connection.findFirst({
        where: {
          id: body.sourceConnectionId!.trim(),
          userId,
        },
        select: {
          company: true,
          jobUrl: true,
          jobTitle: true,
          notes: true,
        },
      })

      if (!sourceConnection) {
        return NextResponse.json({ error: 'Source connection not found' }, { status: 404 })
      }
    }

    const normalizedProfileUrl = normalizeProfileUrl(body.profileUrl)
    if (normalizedProfileUrl) {
      const altProfileUrl = normalizedProfileUrl.endsWith('/')
        ? normalizedProfileUrl.slice(0, -1)
        : `${normalizedProfileUrl}/`

      const existingByProfile = await prisma.connection.findFirst({
        where: {
          userId,
          OR: [
            { profileUrl: { equals: normalizedProfileUrl, mode: 'insensitive' } },
            { profileUrl: { equals: altProfileUrl, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      })

      if (existingByProfile) {
        return NextResponse.json(
          { error: 'Connection already exists', existingId: existingByProfile.id },
          { status: 409 }
        )
      }
    }

    const companyForMatch = normalizeCompany(
      hasSource ? sourceConnection?.company : body.company
    )
    const roleForMatch = body.role?.trim() || ''
    const nameForMatch = body.name?.trim() || ''

    if (companyForMatch && roleForMatch && nameForMatch) {
      const existingByFields = await prisma.connection.findFirst({
        where: {
          userId,
          name: { equals: nameForMatch, mode: 'insensitive' },
          role: { equals: roleForMatch, mode: 'insensitive' },
          OR: [
            { company: { equals: companyForMatch, mode: 'insensitive' } },
            { company: { equals: body.company?.trim() || '', mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      })

      if (existingByFields) {
        return NextResponse.json(
          { error: 'Connection already exists', existingId: existingByFields.id },
          { status: 409 }
        )
      }
    }

    const connection = await prisma.connection.create({
      data: {
        userId,
        name: body.name.trim(),
        profileUrl: body.profileUrl || null,
        company: normalizeCompany(hasSource ? sourceConnection!.company : body.company!.trim()),
        role: body.role.trim(),
        jobUrl: hasSource ? sourceConnection!.jobUrl : (body.jobUrl || null),
        jobTitle: hasSource ? sourceConnection!.jobTitle : (body.jobTitle || null),
        notes: hasSource ? sourceConnection!.notes : (body.notes || null),
        status: 'PENDING',
        ...(parsedDateSent ? { dateSent: parsedDateSent } : {}),
        ...(parsedLastContactedAt ? { lastContactedAt: parsedLastContactedAt } : {}),
      },
    })

    return NextResponse.json(connection)
  } catch (error: unknown) {
    console.error('Error creating connection:', error)
    return NextResponse.json(
      { error: 'Failed to create connection' },
      { status: 500 }
    )
  }
}
