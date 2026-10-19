import { createClient } from '@/lib/supabase/server'
import { isAuthorizationNotFound } from '@/lib/oauth/authorization-error'
import { isClaudeRedirectUri } from '@/lib/oauth/claude-redirect'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CANNOT_CONNECT = "This app can't connect to the Salo CRM."

type AuthorizationPayload = {
  authorization_id?: string
  redirect_url?: string
  redirect_uri?: string
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const expected = new URL(request.url).origin
  if (origin) return origin === expected
  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === expected
  } catch {
    return false
  }
}

function consentErrorRedirect(
  request: Request,
  authorizationId: string,
  message: string
) {
  const url = new URL('/oauth/consent', request.url)
  url.searchParams.set('authorization_id', authorizationId)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url, 303)
}

type DecisionResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'consent'; message: string }
  | { kind: 'reject'; status: number; error: string }

// Share one decision for this authorization so a double submit cannot approve twice.
const decisionRequests = new Map<string, Promise<DecisionResult>>()

async function decide(
  authorizationId: string,
  decision: FormDataEntryValue | null
): Promise<DecisionResult> {
  const supabase = await createClient()
  const { data, error: detailsError } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (detailsError || !data) {
    return {
      kind: 'consent',
      message:
        detailsError?.message ||
        'This connection request has expired. Start again from Claude.',
    }
  }

  const details = data as AuthorizationPayload

  if (!details.authorization_id) {
    if (!details.redirect_url || !isClaudeRedirectUri(details.redirect_url)) {
      return { kind: 'reject', status: 400, error: CANNOT_CONNECT }
    }
    return { kind: 'redirect', url: details.redirect_url }
  }

  if (!details.redirect_uri || !isClaudeRedirectUri(details.redirect_uri)) {
    return { kind: 'reject', status: 400, error: CANNOT_CONNECT }
  }

  const result =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })

  if (result.error || !result.data?.redirect_url) {
    return {
      kind: 'consent',
      message: result.error?.message || 'Could not finish the connection.',
    }
  }
  if (!isClaudeRedirectUri(result.data.redirect_url)) {
    return { kind: 'reject', status: 400, error: CANNOT_CONNECT }
  }
  return { kind: 'redirect', url: result.data.redirect_url }
}

function decisionResponse(
  request: Request,
  authorizationId: string,
  result: DecisionResult
) {
  if (result.kind === 'redirect') return NextResponse.redirect(result.url, 303)
  if (result.kind === 'consent') {
    return consentErrorRedirect(request, authorizationId, result.message)
  }
  return NextResponse.json({ error: result.error }, { status: result.status })
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form = await request.formData()
  const decision = form.get('decision')
  const authorizationId = form.get('authorization_id')
  if (typeof authorizationId !== 'string' || !authorizationId) {
    return NextResponse.json({ error: 'Missing authorization request' }, { status: 400 })
  }

  const key = `${decision === 'approve' ? 'approve' : 'deny'}:${authorizationId}`
  let pending = decisionRequests.get(key)
  if (!pending) {
    pending = decide(authorizationId, decision).then((result) => {
      if (result.kind === 'consent' && !isAuthorizationNotFound(result.message)) {
        decisionRequests.delete(key)
      }
      if (result.kind === 'reject') decisionRequests.delete(key)
      return result
    })
    decisionRequests.set(key, pending)
  }

  return decisionResponse(request, authorizationId, await pending)
}
