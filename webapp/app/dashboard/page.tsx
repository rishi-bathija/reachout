import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { Plus } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const connections = await prisma.connection.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  })

  const stats = {
    total: connections.length,
    pending: connections.filter(c => c.status === 'PENDING').length,
    accepted: connections.filter(c => c.status === 'ACCEPTED').length,
    messaged: connections.filter(c => c.status === 'MESSAGED').length,
    responded: connections.filter(c => c.status === 'RESPONDED').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Connections</h2>
          <p className="text-gray-600 mt-1">Manage your LinkedIn outreach</p>
        </div>
        <Link href="/dashboard/add">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Connection
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Accepted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.accepted}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Messaged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.messaged}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Responded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.responded}</div>
          </CardContent>
        </Card>
      </div>

      {/* Connections List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Connections</CardTitle>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No connections yet</p>
              <Link href="/dashboard/add">
                <Button>Add Your First Connection</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map((connection) => (
                <Link 
                  key={connection.id} 
                  href={`/dashboard/connections/${connection.id}`}
                  className="block"
                >
                  <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{connection.name}</h3>
                        <p className="text-sm text-gray-600">
                          {connection.role} at {connection.company}
                        </p>
                        {connection.jobTitle && (
                          <p className="text-sm text-gray-500 mt-1">
                            Applied for: {connection.jobTitle}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge 
                          variant={
                            connection.status === 'PENDING' ? 'secondary' :
                            connection.status === 'ACCEPTED' ? 'default' :
                            connection.status === 'MESSAGED' ? 'default' :
                            'default'
                          }
                        >
                          {connection.status}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(connection.dateSent), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}