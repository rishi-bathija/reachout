import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Calendar, Briefcase, FileText } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import StatusUpdateForm from './StatusUpdateForm'
import AddMessageForm from './AddMessageForm'
import GenerateMessagePanel from './GenerateMessagePanel'
import ReplyAssistantPanel from './ReplyAssistantPanel'
import ImportConversationPanel from './ImportConversationPanel'
import FollowUpForm from './FollowUpForm'
import NotesEditor from './NotesEditor'

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const connection = await prisma.connection.findUnique({
    where: {
      id,
      userId: user.id, // Ensure user can only see their own connections
    },
    include: {
      messages: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      },
      generatedMessages: {
        orderBy: { generatedAt: 'desc' },
      },
    }
  })

  if (!connection) {
    notFound()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard">
          <Button variant="ghost">← Back to Dashboard</Button>
        </Link>
        <Badge 
          variant={
            connection.status === 'PENDING' ? 'secondary' :
            connection.status === 'ACCEPTED' ? 'default' :
            'default'
          }
          className="text-lg px-4 py-1"
        >
          {connection.status}
        </Badge>
      </div>

      {/* Connection Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl mb-2">{connection.name}</CardTitle>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  <span>{connection.role} at {connection.company}</span>
                </div>
                {connection.jobTitle && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Applied for: {connection.jobTitle}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Connected {formatDistanceToNow(new Date(connection.dateSent), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection.profileUrl && (
            <div>
              <label className="text-sm font-medium text-gray-700">LinkedIn Profile</label>
              <a 
                href={connection.profileUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mt-1"
              >
                {connection.profileUrl}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}

          {connection.jobUrl && (
            <div>
              <label className="text-sm font-medium text-gray-700">Job Posting</label>
              <a 
                href={connection.jobUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mt-1"
              >
                {connection.jobUrl}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}

          <NotesEditor connectionId={connection.id} initialNotes={connection.notes} />
        </CardContent>
      </Card>

      {/* Status Update */}
      <Card>
        <CardHeader>
          <CardTitle>Update Status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusUpdateForm 
            connectionId={connection.id} 
            currentStatus={connection.status} 
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up Reminder</CardTitle>
        </CardHeader>
        <CardContent>
          <FollowUpForm
            connectionId={connection.id}
            nextFollowUpAt={connection.nextFollowUpAt ? connection.nextFollowUpAt.toISOString() : null}
          />
        </CardContent>
      </Card>

      <GenerateMessagePanel
        connectionId={connection.id}
        connectionName={connection.name}
        company={connection.company}
        role={connection.role}
        jobTitle={connection.jobTitle}
        jobUrl={connection.jobUrl}
        notes={connection.notes}
        profileUrl={connection.profileUrl}
        history={connection.generatedMessages}
      />

      <ReplyAssistantPanel connectionId={connection.id} />

      <ImportConversationPanel connectionId={connection.id} />

      {/* Conversation History */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation History</CardTitle>
        </CardHeader>
        <CardContent>
          {connection.messages.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No messages yet</p>
          ) : (
            <div className="space-y-4">
              {connection.messages.map((message) => (
                <div 
                  key={message.id}
                  className={`p-4 rounded-lg ${
                    message.sender === 'USER' 
                      ? 'bg-blue-50 ml-8' 
                      : 'bg-gray-50 mr-8'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {message.sender === 'USER' ? 'You' : connection.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-6">
            <AddMessageForm connectionId={connection.id} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
