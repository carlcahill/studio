export function isClaudeRedirectUri(uri: string) {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.username || url.password || url.hash) return false
  if (
    url.protocol === 'https:' &&
    url.hostname === 'claude.ai' &&
    url.pathname === '/api/mcp/auth_callback'
  ) {
    return true
  }
  if (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.pathname === '/callback'
  ) {
    return true
  }
  return false
}

export function isLoopbackRedirect(uri: string) {
  try {
    const host = new URL(uri).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}
