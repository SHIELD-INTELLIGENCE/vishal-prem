import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { AlertCircle, ArrowRight, CheckCircle2, LogOut, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { getInvite, acceptInvite } from '@/data/users'
import { joinSchema, type JoinValues } from '@/lib/validation'
import { friendlyFirebaseError } from '@/lib/errors'
import { ROLE_LABELS } from '@/auth/permissions'
import type { Invite } from '@/types/models'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { LoadingScreen } from '@/components/ui/Feedback'
import { LogoMark } from '@/components/ui/Logo'
import { PasswordField } from './PasswordField'

export function JoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { firebaseUser, signOut, status } = useAuth()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<JoinValues>({
    resolver: zodResolver(joinSchema),
    defaultValues: { displayName: '', password: '', confirmPassword: '' },
  })

  useEffect(() => {
    let active = true
    getInvite(token)
      .then((result) => {
        if (!active) return
        if (!result) setLoadError('This invitation link is not valid.')
        else if (result.status !== 'pending') setLoadError('This invitation has already been used or revoked.')
        else if (new Date(result.expiresAt).getTime() < Date.now()) setLoadError('This invitation has expired. Ask the Super Admin for a new link.')
        else {
          setInvite(result)
          reset({ displayName: result.displayName, password: '', confirmPassword: '' })
        }
      })
      .catch((error) => {
        if (active) setLoadError(friendlyFirebaseError(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, reset])

  if (loading) return <LoadingScreen label="Checking invitation…" />

  if (loadError) {
    return (
      <Shell>
        <AlertCircle className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="mt-3 font-display text-2xl font-semibold">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-ink-500">{loadError}</p>
        <Button className="mt-5" variant="outline" onClick={() => navigate('/admin/login')}>Go to sign in</Button>
      </Shell>
    )
  }

  if (!invite || !auth) return null

  const emailMatches = firebaseUser?.email?.toLowerCase() === invite.email
  const canCompleteExisting = status === 'unlinked' && emailMatches

  async function completeExistingAccount() {
    if (!firebaseUser) return
    setSubmitError(null)
    try {
      setCompleting(true)
      await acceptInvite({
        token: invite!.token,
        uid: firebaseUser.uid,
        email: invite!.email,
        displayName: firebaseUser.displayName || invite!.displayName,
        passwordSetAt: new Date().toISOString(),
      })
      toast.success('Staff profile linked')
      navigate('/admin', { replace: true })
    } catch (error) {
      setSubmitError(friendlyFirebaseError(error))
    } finally {
      setCompleting(false)
    }
  }

  async function onSubmit(values: JoinValues) {
    setSubmitError(null)
    try {
      const credential = await createUserWithEmailAndPassword(auth!, invite!.email, values.password)
      await updateProfile(credential.user, { displayName: values.displayName })
      await acceptInvite({
        token: invite!.token,
        uid: credential.user.uid,
        email: invite!.email,
        displayName: values.displayName,
        passwordSetAt: new Date().toISOString(),
      })
      toast.success('Account created. Welcome to the workspace.')
      navigate('/admin', { replace: true })
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      if (auth?.currentUser) {
        await signOut().catch(() => undefined)
      }
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ivory-50 px-4 py-10">
      <div className="mb-5 flex items-center gap-3">
        <LogoMark size={48} />
        <div>
          <p className="font-display text-xl font-semibold">Vishal Prem</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">Management</p>
        </div>
      </div>
      <div className="surface-card w-full max-w-lg p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">Staff invitation</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">Join the workspace</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{invite.email}</p>
          </div>
          <div className="rounded-xl bg-ivory-100 px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">Role</p>
            <p className="text-sm font-semibold text-ink-800">{ROLE_LABELS[invite.role]}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-ink-200 bg-ivory-50 p-3 text-xs text-ink-600 sm:grid-cols-2">
          <p><span className="font-semibold">Expires:</span> {new Date(invite.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          <p><span className="font-semibold">Outlets:</span> {invite.outletIds.length}</p>
        </div>

        {firebaseUser && !canCompleteExisting ? (
          <div className="mt-5 rounded-xl border border-gold-200 bg-gold-50 p-4 text-sm text-gold-900">
            <p className="font-semibold">You are already signed in as {firebaseUser.email}.</p>
            <p className="mt-1 text-xs leading-relaxed">Sign out first, then open the invitation link again to create the invited account.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => void signOut()}
              leftIcon={<LogOut className="h-3.5 w-3.5" />}
            >
              Sign out
            </Button>
          </div>
        ) : canCompleteExisting ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-sage-200 bg-sage-50 p-4 text-sm text-sage-900">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Signed in with the invited email</p>
              <p className="mt-1 text-xs leading-relaxed">Complete your profile to link this Firebase sign-in to the staff account.</p>
            </div>
            {submitError && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{submitError}</p>}
            <Button onClick={() => void completeExistingAccount()} loading={completing} className="w-full">
              Complete profile
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
            <TextField
              label="Your name"
              placeholder="Full name"
              autoComplete="name"
              required
              error={errors.displayName?.message}
              {...register('displayName')}
            />
            <PasswordField
              id="join-password"
              label="Create a password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              hint="Use a unique password. Do not reuse your personal password."
              required
              error={errors.password?.message}
              {...register('password')}
            />
            <PasswordField
              id="join-confirm"
              label="Confirm password"
              autoComplete="new-password"
              placeholder="Repeat the password"
              required
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            {submitError && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{submitError}</p>}
            <Button type="submit" className="w-full" loading={isSubmitting} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Create my staff account
            </Button>
          </form>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4 text-xs text-ink-500">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sage-600" /> Invitation verified</span>
          <Link to="/admin/login" className="font-semibold text-brand-700 hover:underline">Sign in instead</Link>
        </div>
      </div>
      <p className="mt-5 max-w-md text-center text-[11px] leading-relaxed text-ink-400">
        Invitation links are single-use and expire. Never forward this link to another person.
      </p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ivory-50 px-4">
      <div className="surface-card w-full max-w-md p-7 text-center">{children}</div>
    </div>
  )
}
