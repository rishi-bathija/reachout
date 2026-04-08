import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
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

    // Verify connection belongs to user
    const connection = await prisma.connection.findUnique({
      where: { id, userId: user.id }
    })

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const body = (await request.json()) as {
      content?: string
      sender?: string
      generatedMessageId?: string
    }

    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
    }

    if (!body.sender || (body.sender !== 'USER' && body.sender !== 'THEM')) {
      return NextResponse.json({ error: 'Invalid sender' }, { status: 400 })
    }

    const maxOrder = await prisma.message.aggregate({
      where: { connectionId: id },
      _max: { orderIndex: true },
    })

    const nextOrderIndex =
      typeof maxOrder._max.orderIndex === 'number' ? maxOrder._max.orderIndex + 1 : 0

    const message = await prisma.message.create({
      data: {
        connectionId: id,
        content: body.content.trim(),
        sender: body.sender,
        orderIndex: nextOrderIndex,
      },
    })

    if (body.sender === 'USER') {
      await prisma.connection.update({
        where: { id },
        data: { lastContactedAt: new Date() },
      })
    }

    if (body.generatedMessageId) {
      await prisma.generatedMessage.updateMany({
        where: {
          id: body.generatedMessageId,
          connectionId: id,
        },
        data: {
          used: true,
        },
      })
    }

    return NextResponse.json(message)
  } catch (error: unknown) {
    console.error('Error adding message:', error)
    return NextResponse.json(
      { error: 'Failed to add message' },
      { status: 500 }
    )
  }
}
