import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

type AddMessageBody = {
  content?: string
  sender?: 'USER' | 'THEM'
  generatedMessageId?: string
}

type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

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
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsedBody = body as AddMessageBody
    const content = typeof parsedBody.content === 'string' ? parsedBody.content.trim() : ''
    const sender = parsedBody.sender
    const generatedMessageId =
      typeof parsedBody.generatedMessageId === 'string' ? parsedBody.generatedMessageId : undefined

    if (!content) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
    }

    if (sender !== 'USER' && sender !== 'THEM') {
      return NextResponse.json({ error: 'Invalid sender' }, { status: 400 })
    }

    const txFn = async (tx: TransactionClient) => {
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
    }

    const message = await prisma.$transaction(txFn)

    return NextResponse.json(message)
  } catch (error: unknown) {
    console.error('Error adding message:', error)
    return NextResponse.json(
      { error: 'Failed to add message' },
      { status: 500 }
    )
  }
}
