'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react'
import { toast } from 'sonner'

export function AccountPasswordClient({
  email,
  hasPassword: initialHasPassword,
}: {
  email: string
  hasPassword: boolean
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [hasPassword, setHasPassword] = useState(initialHasPassword)
  const supabase = createClient()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaved(false)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        const message = updateError.message || 'Could not save your password.'
        if (message.toLowerCase().includes('reauthenticat')) {
          throw new Error('Sign out, sign in with Google again, then set your password straight away.')
        }
        throw new Error(message)
      }

      setPassword('')
      setConfirmPassword('')
      setHasPassword(true)
      setSaved(true)
      toast.success('Password saved')
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Could not save your password.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{hasPassword ? 'Change your password' : 'Set a password'}</CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Use this email and password anywhere that asks you to sign in to Studio. Google sign-in still works.'
            : 'Your account currently signs in with Google only. Set a password if another app needs this email and a password.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Email </span>
          <span className="font-medium">{email}</span>
        </div>

        {saved && (
          <div className="flex items-start gap-2 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Password saved for {email}. You can sign in with this email and password, and Google sign-in still works.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{hasPassword ? 'New password' : 'Password'}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pl-9"
                required
                minLength={8}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="pl-9"
                required
                minLength={8}
                disabled={loading}
              />
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
