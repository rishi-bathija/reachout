import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { generateExtensionToken, hashExtensionToken } from '@/lib/extension/tokens'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = generateExtensionToken()
    const tokenHash = hashExtensionToken(token)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await prisma.extensionToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    })

    return NextResponse.json({ token, expiresAt })
  } catch (error: unknown) {
    console.error('Error creating extension token:', error)
    return NextResponse.json(
      { error: 'Failed to create extension token' },
      { status: 500 }
    )
  }
}
