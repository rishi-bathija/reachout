import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashExtensionToken } from '@/lib/extension/tokens'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string }

    if (!body.token || !body.token.trim()) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const tokenHash = hashExtensionToken(body.token.trim())

    const existing = await prisma.extensionToken.findUnique({
      where: { tokenHash },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    if (existing.linkedAt) {
      await prisma.extensionToken.update({
        where: { tokenHash },
        data: { expiresAt: newExpiry },
      })
      return NextResponse.json({ success: true, alreadyLinked: true })
    }

    await prisma.extensionToken.update({
      where: { tokenHash },
      data: { linkedAt: new Date(), expiresAt: newExpiry },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error confirming extension token:', error)
    return NextResponse.json(
      { error: 'Failed to confirm extension token' },
      { status: 500 }
    )
  }
}
