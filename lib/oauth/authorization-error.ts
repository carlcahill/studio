export function isAuthorizationNotFound(message?: string | null) {
  return !!message && message.toLowerCase().includes('authorization not found')
}
