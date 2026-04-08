import { prisma } from '@/lib/prisma'
import { hashExtensionToken } from '@/lib/extension/tokens'

export async function getUserIdFromExtensionAuth(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  console.log('authheader', authHeader);

  const [scheme, token] = authHeader.split(' ')
  console.log('scheme', scheme);
  console.log('token', token);

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  const tokenHash = hashExtensionToken(token.trim())

  console.log('tokenhash', tokenHash);

  const record = await prisma.extensionToken.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true, linkedAt: true },
  })

  console.log('record', record);

  if (!record) return null
  if (!record.linkedAt) return null
  if (record.expiresAt.getTime() < Date.now()) return null

  return record.userId
}
