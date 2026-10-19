import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountPasswordClient } from './account-password-client'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    redirect('/auth/login')
  }

  const providers = [
    ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
    ...(user.identities?.map((identity) => identity.provider) ?? []),
  ]
  const hasPassword = providers.includes('email')

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background">
        <div className="flex h-16 items-center px-6">
          <div>
            <h1 className="text-2xl font-semibold">Password</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with your email as well as Google
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AccountPasswordClient email={user.email} hasPassword={hasPassword} />
      </div>
    </div>
  )
}
