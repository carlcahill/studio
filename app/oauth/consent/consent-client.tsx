'use client'

import { createClient } from '@/lib/supabase/client'
import { isAuthorizationNotFound } from '@/lib/oauth/authorization-error'
import { isClaudeRedirectUri, isLoopbackRedirect } from '@/lib/oauth/claude-redirect'
import { Button } from '@/components/ui/button'
import { Shell } from './shell'
import { useEffect, useState } from 'react'

type AuthorizationPayload = {
  authorization_id?: string
  redirect_url?: string
  redirect_uri?: string
  client?: { name?: string }
}

type ConsentStatus =
  | { kind: 'loading' }
  | { kind: 'connected' }
  | { kind: 'error'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'consent'; clientName: string; host: string; loopback: boolean }

// Strict mode mounts, unmounts, and mounts again, which runs effects twice.
// Reuse one in-flight request for this page load so the authorization is read once.
const detailRequests = new Map<string, Promise<ConsentStatus>>()
const decisionRequests = new Map<string, Promise<ConsentStatus | void>>()

function loginPath(authorizationId: string) {
  const consentPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
  return `/auth/login?redirect=${encodeURIComponent(consentPath)}`
}

function loadDetails(authorizationId: string): Promise<ConsentStatus> {
  const existing = detailRequests.get(authorizationId)
  if (existing) return existing

  const pending = readDetails(authorizationId).catch((error: unknown) => ({
    kind: 'error' as const,
    message:
      error instanceof Error ? error.message : 'Could not finish the connection.',
  }))
  detailRequests.set(authorizationId, pending)
  return pending
}

async function readDetails(authorizationId: string): Promise<ConsentStatus> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    window.location.assign(loginPath(authorizationId))
    return { kind: 'loading' }
  }

  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId)

  if (error || !data) {
    if (isAuthorizationNotFound(error?.message)) return { kind: 'connected' }
    return {
      kind: 'error',
      message:
        error?.message ||
        'This connection request has expired. Start again from Claude.',
    }
  }

  const details = data as AuthorizationPayload

  if (!details.authorization_id) {
    if (!details.redirect_url || !isClaudeRedirectUri(details.redirect_url)) {
      return {
        kind: 'blocked',
        message: "This app can't connect to the Salo CRM.",
      }
    }
    window.location.assign(details.redirect_url)
    return { kind: 'loading' }
  }

  if (!details.redirect_uri || !isClaudeRedirectUri(details.redirect_uri)) {
    return {
      kind: 'blocked',
      message: `${details.client?.name || 'This app'} isn't allowed to connect to the Salo CRM. Only Claude can.`,
    }
  }

  return {
    kind: 'consent',
    clientName: details.client?.name || 'Claude',
    host: new URL(details.redirect_uri).host,
    loopback: isLoopbackRedirect(details.redirect_uri),
  }
}

function submitDecision(
  authorizationId: string,
  decision: 'approve' | 'deny'
): Promise<ConsentStatus | void> {
  const key = `${decision}:${authorizationId}`
  const existing = decisionRequests.get(key)
  if (existing) return existing

  const pending = postDecision(authorizationId, decision).then((result) => {
    if (result?.kind === 'error') decisionRequests.delete(key)
    return result
  })
  decisionRequests.set(key, pending)
  return pending
}

async function postDecision(
  authorizationId: string,
  decision: 'approve' | 'deny'
): Promise<ConsentStatus | void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const result =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })

  if (result.error || !result.data?.redirect_url) {
    if (user && isAuthorizationNotFound(result.error?.message)) {
      return { kind: 'connected' }
    }
    return {
      kind: 'error',
      message: result.error?.message || 'Could not finish the connection.',
    }
  }

  if (!isClaudeRedirectUri(result.data.redirect_url)) {
    return {
      kind: 'blocked',
      message: "This app can't connect to the Salo CRM.",
    }
  }

  window.location.assign(result.data.redirect_url)
}

export function OAuthConsentClient({
  authorizationId,
  displayName,
  isAdmin,
  initialError,
}: {
  authorizationId: string
  displayName: string
  isAdmin: boolean
  initialError?: string
}) {
  const [status, setStatus] = useState<ConsentStatus>(
    isAuthorizationNotFound(initialError) ? { kind: 'connected' } : { kind: 'loading' }
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthorizationNotFound(initialError)) return

    let active = true
    loadDetails(authorizationId).then((next) => {
      if (active) setStatus(next)
    })
    return () => {
      active = false
    }
  }, [authorizationId, initialError])

  async function onDecision(decision: 'approve' | 'deny') {
    setSubmitting(true)
    const next = await submitDecision(authorizationId, decision)
    if (next) setStatus(next)
    if (next?.kind !== 'loading') setSubmitting(false)
  }

  if (status.kind === 'loading') {
    return (
      <Shell title="Connect Claude">
        <p className="text-sm text-muted-foreground">Checking this connection…</p>
      </Shell>
    )
  }

  if (status.kind === 'connected') {
    return (
      <Shell title="You're connected">
        <p className="text-sm text-muted-foreground">
          You&apos;re connected. You can close this tab and return to Claude.
        </p>
      </Shell>
    )
  }

  if (status.kind === 'error' || status.kind === 'blocked') {
    return (
      <Shell title={status.kind === 'blocked' ? "Can't connect" : 'Connect Claude'}>
        <p
          className={
            status.kind === 'error'
              ? 'text-sm text-destructive'
              : 'text-sm text-muted-foreground'
          }
        >
          {status.message}
        </p>
      </Shell>
    )
  }

  const clientName = status.clientName

  return (
    <Shell title={`Allow ${clientName}?`}>
      {initialError && !isAuthorizationNotFound(initialError) && (
        <p className="text-sm text-destructive">{initialError}</p>
      )}
      <p className="text-sm">
        {clientName} is asking to use the Salo CRM as{' '}
        <span className="font-semibold">{displayName}</span>.
      </p>
      <p className="text-sm text-muted-foreground">
        It can read the CRM, and add contacts and log activity if you are an
        admin.
        {isAdmin
          ? ' Your account can make those changes.'
          : ' Your account can read. Changes stay with admins.'}
      </p>
      <p className="text-sm text-muted-foreground">
        After you choose, you&apos;ll return to{' '}
        <span className="font-semibold text-foreground">{status.host}</span>.
      </p>
      {status.loopback && (
        <p className="text-sm text-muted-foreground">
          That address is on this computer. Approve only if you just started
          this from Claude.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={submitting}
          onClick={() => onDecision('approve')}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={() => onDecision('deny')}
        >
          Deny
        </Button>
      </div>
    </Shell>
  )
}
