import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { Plus } from 'lucide-react'
import { unstable_noStore as noStore } from 'next/cache'
import { listConnectionsForUser, type ConnectionListResult } from '@/lib/connections/list'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type SearchParams = {
  page?: string | string[]
  limit?: string | string[]
  offset?: string | string[]
  sortBy?: string | string[]
  sortDir?: string | string[]
  search?: string | string[]
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  noStore()
  const resolvedSearchParams = (await searchParams) ?? {}
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const search = Array.isArray(resolvedSearchParams.search)
    ? resolvedSearchParams.search[0]
    : resolvedSearchParams.search
  const sortBy = Array.isArray(resolvedSearchParams.sortBy)
    ? resolvedSearchParams.sortBy[0]
    : resolvedSearchParams.sortBy
  const sortDir = Array.isArray(resolvedSearchParams.sortDir)
    ? resolvedSearchParams.sortDir[0]
    : resolvedSearchParams.sortDir
  const limit = Array.isArray(resolvedSearchParams.limit)
    ? resolvedSearchParams.limit[0]
    : resolvedSearchParams.limit
  const page = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page
  const offset = Array.isArray(resolvedSearchParams.offset)
    ? resolvedSearchParams.offset[0]
    : resolvedSearchParams.offset

  let connections: ConnectionListResult['data'] = []
  let meta: ConnectionListResult['meta'] = {
    total: 0,
    limit: 20,
    offset: 0,
    sortBy: 'updatedAt',
    sortDir: 'desc',
  }
  let listError = ''

  try {
    // Direct DB query via shared helper (no internal HTTP, so no cookie/header plumbing needed).
    // console.log('[dashboard] sortBy/sortDir', { sortBy, sortDir, search, limit, page, offset })

    const payload = await listConnectionsForUser(user.id, {
      search,
      sortBy,
      sortDir,
      limit,
      page,
      offset,
    })
    connections = payload.data
    meta = payload.meta
  } catch {
    listError = 'Failed to load connections list.'
  }

  const now = new Date()
  const [
    total,
    pending,
    accepted,
    messaged,
    responded,
    followUpDue,
    dueFollowUps,
  ] = await Promise.all([
    prisma.connection.count({ where: { userId: user.id } }),
    prisma.connection.count({ where: { userId: user.id, status: 'PENDING' } }),
    prisma.connection.count({ where: { userId: user.id, status: 'ACCEPTED' } }),
    prisma.connection.count({ where: { userId: user.id, status: 'MESSAGED' } }),
    prisma.connection.count({ where: { userId: user.id, status: 'RESPONDED' } }),
    prisma.connection.count({
      where: {
        userId: user.id,
        nextFollowUpAt: { lte: now },
      },
    }),
    prisma.connection.findMany({
      where: {
        userId: user.id,
        nextFollowUpAt: { lte: now },
      },
      orderBy: { nextFollowUpAt: 'asc' },
      take: 6,
      select: {
        id: true,
        name: true,
        role: true,
        company: true,
        nextFollowUpAt: true,
      },
    }),
  ])

  const stats = {
    total,
    pending,
    accepted,
    messaged,
    responded,
    followUpDue,
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
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Follow-up Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.followUpDue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Due Follow-ups */}
      <Card>
        <CardHeader>
          <CardTitle>Due Follow-ups</CardTitle>
        </CardHeader>
        <CardContent>
          {dueFollowUps.length === 0 ? (
            <p className="text-sm text-gray-500">No follow-ups due right now.</p>
          ) : (
            <div className="space-y-3">
              {dueFollowUps.map((connection) => (
                <Link
                  key={`due-${connection.id}`}
                  href={`/dashboard/connections/${connection.id}`}
                  className="block rounded-md border p-3 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{connection.name}</p>
                      <p className="text-sm text-gray-600">
                        {connection.role} at {connection.company}
                      </p>
                    </div>
                    <p className="text-xs text-red-600">
                      Due {formatDistanceToNow(new Date(connection.nextFollowUpAt!), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connections List */}
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="space-y-1">
                <label htmlFor="search" className="text-xs font-medium text-gray-600">Search</label>
                <input
                  id="search"
                  name="search"
                  defaultValue={search ?? ''}
                  placeholder="Name, company, role, job title"
                  className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm md:w-64"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="limit" className="text-xs font-medium text-gray-600">Page size</label>
                <select
                  id="limit"
                  name="limit"
                  defaultValue={String(meta.limit)}
                  className="h-9 rounded-md border border-gray-200 px-2 text-sm"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
              <input type="hidden" name="sortBy" value={meta.sortBy} />
              <input type="hidden" name="sortDir" value={meta.sortDir} />
              <input type="hidden" name="page" value="1" />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="outline">Apply</Button>
              <Link href="/dashboard">
                <Button type="button" variant="ghost">Reset</Button>
              </Link>
            </div>
          </form>

          {listError && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {listError}
            </div>
          )}

          {connections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No connections yet</p>
              <Link href="/dashboard/add">
                <Button>Add Your First Connection</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              {(() => {
                const buildSortLink = (field: string) => {
                  const nextDir =
                    meta.sortBy === field && meta.sortDir === 'asc' ? 'desc' : 'asc'
                  return {
                    pathname: '/dashboard',
                    query: {
                      search,
                      limit: meta.limit,
                      sortBy: field,
                      sortDir: nextDir,
                      page: 1,
                    },
                  }
                }

                const sortIndicator = (field: string) => {
                  if (meta.sortBy !== field) return '↕'
                  return meta.sortDir === 'asc' ? '↑' : '↓'
                }

                return (
                  <Table className="min-w-full text-sm">
                    <TableHeader className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <TableRow>
                        <TableHead className="px-4 py-3 text-left font-medium">
                          <Link href={buildSortLink('name')} className="inline-flex items-center gap-2 hover:text-gray-700">
                            Name <span className="text-[10px]">{sortIndicator('name')}</span>
                          </Link>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">
                          <Link href={buildSortLink('company')} className="inline-flex items-center gap-2 hover:text-gray-700">
                            Company <span className="text-[10px]">{sortIndicator('company')}</span>
                          </Link>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">
                          <Link href={buildSortLink('role')} className="inline-flex items-center gap-2 hover:text-gray-700">
                            Role <span className="text-[10px]">{sortIndicator('role')}</span>
                          </Link>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">
                          <Link href={buildSortLink('status')} className="inline-flex items-center gap-2 hover:text-gray-700">
                            Status <span className="text-[10px]">{sortIndicator('status')}</span>
                          </Link>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">
                          <Link href={buildSortLink('lastContactedAt')} className="inline-flex items-center gap-2 hover:text-gray-700">
                            Last Contacted <span className="text-[10px]">{sortIndicator('lastContactedAt')}</span>
                          </Link>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">
                          <Link href={buildSortLink('nextFollowUpAt')} className="inline-flex items-center gap-2 hover:text-gray-700">
                            Next Follow-up <span className="text-[10px]">{sortIndicator('nextFollowUpAt')}</span>
                          </Link>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-left font-medium">
                          <Link href={buildSortLink('dateSent')} className="inline-flex items-center gap-2 hover:text-gray-700">
                            Sent <span className="text-[10px]">{sortIndicator('dateSent')}</span>
                          </Link>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-right font-medium">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-gray-200 bg-white">
                      {connections.map((connection, index) => {
                        const lastContacted = connection.lastContactedAt
                          ? formatDistanceToNow(new Date(connection.lastContactedAt), { addSuffix: true })
                          : '—'
                        const nextFollowUp = connection.nextFollowUpAt
                          ? formatDistanceToNow(new Date(connection.nextFollowUpAt), { addSuffix: true })
                          : '—'
                        return (
                          <TableRow
                            key={connection.id}
                            className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} group`}
                          >
                            <TableCell className="px-4 py-3">
                              <Link
                                href={`/dashboard/connections/${connection.id}`}
                                className="font-medium text-gray-900 hover:text-blue-600"
                              >
                                {connection.name}
                              </Link>
                              {connection.jobTitle && (
                                <div className="text-xs text-gray-500">Target: {connection.jobTitle}</div>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-gray-700">{connection.company}</TableCell>
                            <TableCell className="px-4 py-3 text-gray-700">{connection.role}</TableCell>
                            <TableCell className="px-4 py-3">
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
                            </TableCell>
                            <TableCell className="px-4 py-3 text-gray-600">{lastContacted}</TableCell>
                            <TableCell className="px-4 py-3 text-gray-600">{nextFollowUp}</TableCell>
                            <TableCell className="px-4 py-3 text-gray-600">
                              {formatDistanceToNow(new Date(connection.dateSent), { addSuffix: true })}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                {connection.profileUrl && (
                                  <a
                                    href={connection.profileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-gray-500 hover:text-gray-800"
                                  >
                                    LinkedIn
                                  </a>
                                )}
                                <Link
                                  href={`/dashboard/connections/${connection.id}`}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                >
                                  Open
                                </Link>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )
              })()}
            </div>
          )}

          {meta.total > 0 && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t pt-4 text-sm text-gray-600 md:flex-row">
              <div>
                Showing {Math.min(meta.offset + 1, meta.total)}-{Math.min(meta.offset + meta.limit, meta.total)} of {meta.total}
              </div>
              <div className="flex gap-2">
                <Link
                  href={{
                    pathname: '/dashboard',
                    query: {
                      search,
                      sortBy: meta.sortBy,
                      sortDir: meta.sortDir,
                      limit: meta.limit,
                      page: Math.max(1, Math.floor(meta.offset / meta.limit)),
                    },
                  }}
                >
                  <Button type="button" variant="outline" disabled={meta.offset === 0}>
                    Previous
                  </Button>
                </Link>
                <Link
                  href={{
                    pathname: '/dashboard',
                    query: {
                      search,
                      sortBy: meta.sortBy,
                      sortDir: meta.sortDir,
                      limit: meta.limit,
                      page: Math.floor(meta.offset / meta.limit) + 2,
                    },
                  }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    disabled={meta.offset + meta.limit >= meta.total}
                  >
                    Next
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
