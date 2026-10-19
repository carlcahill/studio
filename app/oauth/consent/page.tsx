import { createClient } from '@/lib/supabase/server'
import { isAuthorizationNotFound } from '@/lib/oauth/authorization-error'
import { redirect } from 'next/navigation'
import { OAuthConsentClient } from './consent-client'
import { Shell } from './shell'

export const dynamic = 'force-dynamic'

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

  if (isAuthorizationNotFound(params.error)) {
    return (
      <Shell title="You're connected">
        <p className="text-sm text-muted-foreground">
          You&apos;re connected. You can close this tab and return to Claude.
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

  return (
    <OAuthConsentClient
      authorizationId={authorizationId}
      displayName={displayName}
      isAdmin={isAdmin}
      initialError={params.error}
    />
  )
}
