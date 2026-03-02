import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const STATUS_OPTIONS = ['PENDING', 'ACCEPTED', 'MESSAGED', 'RESPONDED'] as const
const SENDER_OPTIONS = ['USER', 'THEM'] as const

type Props = {
  params: Promise<{ id: string }>
}

export default async function ConnectionDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const connection = await prisma.connection.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!connection) {
    notFound()
  }

  async function updateStatus(formData: FormData) {
    'use server'

    const status = formData.get('status')
    if (typeof status !== 'string' || !STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])) {
      return
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect('/auth/login')
    }

    await prisma.connection.updateMany({
      where: { id, userId: user.id },
      data: { status },
    })

    revalidatePath('/dashboard')
    revalidatePath(`/dashboard/connections/${id}`)
  }

  async function addMessage(formData: FormData) {
    'use server'

    const sender = formData.get('sender')
    const content = formData.get('content')

    if (
      typeof sender !== 'string' ||
      !SENDER_OPTIONS.includes(sender as (typeof SENDER_OPTIONS)[number]) ||
      typeof content !== 'string' ||
      !content.trim()
    ) {
      return
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect('/auth/login')
    }

    const ownedConnection = await prisma.connection.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })

    if (!ownedConnection) {
      return
    }

    await prisma.message.create({
      data: {
        connectionId: ownedConnection.id,
        sender,
        content: content.trim(),
      },
    })

    if (sender === 'USER') {
      await prisma.connection.updateMany({
        where: {
          id: ownedConnection.id,
          userId: user.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        data: { status: 'MESSAGED' },
      })
    }

    revalidatePath('/dashboard')
    revalidatePath(`/dashboard/connections/${id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-2xl">{connection.name}</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {connection.role} at {connection.company}
            </p>
          </div>
          <Badge>{connection.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          {connection.profileUrl && (
            <p>
              LinkedIn:{' '}
              <a className="text-blue-600 underline" href={connection.profileUrl} target="_blank" rel="noreferrer">
                Open profile
              </a>
            </p>
          )}
          {connection.jobTitle && <p>Job Title: {connection.jobTitle}</p>}
          {connection.jobUrl && (
            <p>
              Job Posting:{' '}
              <a className="text-blue-600 underline" href={connection.jobUrl} target="_blank" rel="noreferrer">
                Open job link
              </a>
            </p>
          )}
          {connection.notes && <p>Notes: {connection.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Update Status</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateStatus} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={connection.status}
                className="h-10 w-52 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Save Status</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection.messages.length === 0 ? (
            <p className="text-sm text-gray-500">No messages logged yet.</p>
          ) : (
            <div className="space-y-3">
              {connection.messages.map((message) => {
                const isUser = message.sender === 'USER'
                return (
                  <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-2 ${
                        isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="text-xs mb-1 opacity-80">{message.sender}</p>
                      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      <p className="mt-1 text-[11px] opacity-80">
                        {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <form action={addMessage} className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="sender">Sender</Label>
              <select
                id="sender"
                name="sender"
                defaultValue="USER"
                className="h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SENDER_OPTIONS.map((sender) => (
                  <option key={sender} value={sender}>
                    {sender}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Message</Label>
              <Textarea id="content" name="content" required rows={4} placeholder="Paste or write the message..." />
            </div>
            <Button type="submit">Add Message</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
