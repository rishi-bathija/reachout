import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      status?: string
      nextFollowUpAt?: string | null
      notes?: string | null
    }

    // Verify connection belongs to user
    const existing = await prisma.connection.findUnique({
      where: { id, userId: user.id }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    let parsedFollowUpDate: Date | null | undefined = undefined
    if ('nextFollowUpAt' in body) {
      if (body.nextFollowUpAt === null || body.nextFollowUpAt === '') {
        parsedFollowUpDate = null
      } else if (typeof body.nextFollowUpAt === 'string') {
        const parsed = new Date(body.nextFollowUpAt)
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid follow-up date' }, { status: 400 })
        }
        parsedFollowUpDate = parsed
      } else {
        return NextResponse.json({ error: 'Invalid follow-up date' }, { status: 400 })
      }
    }

    const dataToUpdate: {
      status?: string
      dateAccepted?: Date | null
      nextFollowUpAt?: Date | null
      notes?: string | null
    } = {}

    if (typeof body.status === 'string') {
      dataToUpdate.status = body.status
      dataToUpdate.dateAccepted =
        body.status === 'ACCEPTED' && !existing.dateAccepted
          ? new Date()
          : existing.dateAccepted
    }

    if (parsedFollowUpDate !== undefined) {
      dataToUpdate.nextFollowUpAt = parsedFollowUpDate
    }

    if ('notes' in body) {
      if (body.notes === null || body.notes === undefined || body.notes === '') {
        dataToUpdate.notes = null
      } else if (typeof body.notes === 'string') {
        dataToUpdate.notes = body.notes.trim() || null
      } else {
        return NextResponse.json({ error: 'Invalid notes value' }, { status: 400 })
      }
    }

    const connection = await prisma.connection.update({
      where: { id },
      data: dataToUpdate,
    })

    return NextResponse.json(connection)
  } catch (error: unknown) {
    console.error('Error updating connection:', error)
    return NextResponse.json(
      { error: 'Failed to update connection' },
      { status: 500 }
    )
  }
}
