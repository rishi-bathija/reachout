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

    let body: unknown
    try {
      body = await request.json()
    } catch (error: unknown) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const content = typeof (body as any).content === 'string' ? (body as any).content.trim() : ''
    const sender = (body as any).sender
    const generatedMessageId = typeof (body as any).generatedMessageId === 'string' ? (body as any).generatedMessageId : undefined

    if (!content) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
    }

    if (sender !== 'USER' && sender !== 'THEM') {
      return NextResponse.json({ error: 'Invalid sender' }, { status: 400 })
    }

    const message = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.message.aggregate({
        where: { connectionId: id },
        _max: { orderIndex: true },
      })

      const nextOrderIndex =
        typeof maxOrder._max.orderIndex === 'number' ? maxOrder._max.orderIndex + 1 : 0

      const newMessage = await tx.message.create({
        data: {
          connectionId: id,
          content,
          sender,
          orderIndex: nextOrderIndex,
        },
      })

      if (sender === 'USER') {
        await tx.connection.update({
          where: { id },
          data: { lastContactedAt: new Date() },
        })
      }

      if (generatedMessageId) {
        await tx.generatedMessage.update({
          where: { id: generatedMessageId },
          data: { used: true },
        })
      }

      return newMessage
    })

    return NextResponse.json(message)
  } catch (error: unknown) {
    console.error('Error adding message:', error)
    return NextResponse.json(
      { error: 'Failed to add message' },
      { status: 500 }
    )
  }
}
