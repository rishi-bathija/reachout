import { prisma } from '@/lib/prisma'

type ListParams = {
  search?: string | null
  company?: string | null
  sortBy?: string | null
  sortDir?: string | null
  limit?: string | null
  page?: string | null
  offset?: string | null
}

type ConnectionListItem = {
  id: string
  name: string
  company: string
  role: string
  status: string
  dateSent: Date
  dateAccepted: Date | null
  nextFollowUpAt: Date | null
  lastContactedAt: Date | null
  createdAt: Date
  updatedAt: Date
  jobTitle: string | null
  jobUrl: string | null
  notes: string | null
  profileUrl: string | null
}

type ConnectionListMeta = {
  total: number
  limit: number
  offset: number
  sortBy: string
  sortDir: 'asc' | 'desc'
}

export type ConnectionListResult = {
  data: ConnectionListItem[]
  meta: ConnectionListMeta
}

export async function listConnectionsForUser(
  userId: string,
  params: ListParams
): Promise<ConnectionListResult> {
  const company = params.company?.trim() || null
  const search = params.search?.trim() || null
  const sortByRaw = params.sortBy?.trim() || 'updatedAt'
  const sortDirRaw = params.sortDir?.trim() || 'desc'
  const limitRaw = params.limit ?? null
  const pageRaw = params.page ?? null
  const offsetRaw = params.offset ?? null

  const allowedSortFields = new Set([
    'createdAt',
    'updatedAt',
    'dateSent',
    'dateAccepted',
    'nextFollowUpAt',
    'lastContactedAt',
    'name',
    'company',
    'role',
    'status',
  ])

  const sortBy = allowedSortFields.has(sortByRaw) ? sortByRaw : 'updatedAt'
  const sortDir = sortDirRaw === 'asc' ? 'asc' : 'desc'

  let limit = Number.parseInt(limitRaw ?? '', 10)
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = company && !search ? 5 : 20
  }
  limit = Math.min(limit, 100)

  let offset = Number.parseInt(offsetRaw ?? '', 10)
  if (!Number.isFinite(offset) || offset < 0) {
    const page = Number.parseInt(pageRaw ?? '', 10)
    const safePage = Number.isFinite(page) && page > 0 ? page : 1
    offset = (safePage - 1) * limit
  }

  const searchTerm = search ?? company
  const whereClause: any = {
    userId,
    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { company: { contains: searchTerm, mode: 'insensitive' } },
            { role: { contains: searchTerm, mode: 'insensitive' } },
            { jobTitle: { contains: searchTerm, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(company && !search
      ? {
          company: { contains: company, mode: 'insensitive' },
        }
      : {}),
  }

  const [connections, total] = await Promise.all([
    prisma.connection.findMany({
      where: whereClause,
      orderBy: [{ [sortBy]: sortDir }, { id: 'desc' }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        name: true,
        company: true,
        role: true,
        status: true,
        dateSent: true,
        dateAccepted: true,
        nextFollowUpAt: true,
        lastContactedAt: true,
        createdAt: true,
        updatedAt: true,
        jobTitle: true,
        jobUrl: true,
        notes: true,
        profileUrl: true,
      },
    }),
    prisma.connection.count({ where: whereClause }),
  ])

  return {
    data: connections,
    meta: {
      total,
      limit,
      offset,
      sortBy,
      sortDir,
    },
  }
}
