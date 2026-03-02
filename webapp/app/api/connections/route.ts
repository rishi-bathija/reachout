import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const connection = await prisma.connection.create({
      data: {
        userId: user.id,
        name: body.name,
        profileUrl: body.profileUrl || null,
        company: body.company,
        role: body.role,
        jobUrl: body.jobUrl || null,
        jobTitle: body.jobTitle || null,
        notes: body.notes || null,
        status: 'PENDING',
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
