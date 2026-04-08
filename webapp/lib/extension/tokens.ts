import { randomBytes, createHash } from 'crypto'

export function generateExtensionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashExtensionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
