import { createClient } from '@/lib/supabase/server'
import { isClaudeRedirectUri, isLoopbackRedirect } from '@/lib/oauth/claude-redirect'
import { SaloLogo } from '@/components/brand/salo-logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

type AuthorizationPayload = {
  authorization_id?: string
  redirect_url?: string
  redirect_uri?: string
  client?: { name?: string }
}

function Shell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <SaloLogo className="h-8 w-auto" />
          <div className="space-y-1">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>Salo CRM</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  )
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>
}) {
  const params = await searchParams
  const authorizationId = params.authorization_id
  if (!authorizationId) {
    return (
      <Shell title="Connect Claude">
        <p className="text-sm text-muted-foreground">
          This connection link is missing a request. Start again from Claude.
        </p>
      </Shell>
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const consentPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
    redirect(`/auth/login?redirect=${encodeURIComponent(consentPath)}`)
  }

  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId)

  if (error || !data) {
    return (
      <Shell title="Connect Claude">
        <p className="text-sm text-destructive">
          {params.error ||
            error?.message ||
            'This connection request has expired. Start again from Claude.'}
        </p>
      </Shell>
    )
  }

  const details = data as AuthorizationPayload

  if (!details.authorization_id) {
    if (!details.redirect_url || !isClaudeRedirectUri(details.redirect_url)) {
      return (
        <Shell title="Can't connect">
          <p className="text-sm text-muted-foreground">
            This app can&apos;t connect to the Salo CRM.
          </p>
        </Shell>
      )
    }
    redirect(details.redirect_url)
  }

  if (!details.redirect_uri || !isClaudeRedirectUri(details.redirect_uri)) {
    return (
      <Shell title="Can't connect">
        <p className="text-sm text-muted-foreground">
          {details.client?.name || 'This app'} isn&apos;t allowed to connect to the
          Salo CRM. Only Claude can.
        </p>
      </Shell>
    )
  }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  const displayName = profile?.full_name?.trim() || user.email || 'your account'
  const isAdmin = profile?.role === 'admin'
  const clientName = details.client?.name || 'Claude'
  const host = new URL(details.redirect_uri).host
  const loopback = isLoopbackRedirect(details.redirect_uri)

  return (
    <Shell title={`Allow ${clientName}?`}>
      {params.error && (
        <p className="text-sm text-destructive">{params.error}</p>
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
        <span className="font-semibold text-foreground">{host}</span>.
      </p>
      {loopback && (
        <p className="text-sm text-muted-foreground">
          That address is on this computer. Approve only if you just started
          this from Claude.
        </p>
      )}
      <form action="/oauth/decision" method="POST" className="flex gap-2">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <Button type="submit" name="decision" value="approve">
          Approve
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline">
          Deny
        </Button>
      </form>
    </Shell>
  )
}
