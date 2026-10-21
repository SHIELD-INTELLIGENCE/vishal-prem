import { useState } from 'react'
import { Check, Copy, LogOut, ShieldAlert, WifiOff } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { LogoMark } from '@/components/ui/Logo'
import { useSearchParams } from 'react-router-dom'

function StateShell({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ivory-50 px-4 py-10">
      <div className="surface-card w-full max-w-lg p-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
          {icon}
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink-950">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">{description}</p>
        {children}
      </div>
    </div>
  )
}

export function AccountNotLinked() {
  const { firebaseUser, signOut } = useAuth()
  const [copied, setCopied] = useState(false)

  async function copyUid() {
    if (!firebaseUser) return
    await navigator.clipboard.writeText(firebaseUser.uid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <StateShell
      icon={<ShieldAlert className="h-7 w-7" />}
      title="Account not linked to the workspace"
      description="Your Firebase sign-in worked, but no staff profile exists yet. Send your User ID to the Super Admin so they can create or invite your profile. Do not share your password."
    >
      <div className="mt-5 rounded-xl border border-ink-200 bg-ivory-50 p-3 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">Signed in as</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink-800">{firebaseUser?.email ?? '—'}</p>
        <p className="mt-2 break-all font-mono text-[11px] text-ink-500">{firebaseUser?.uid}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={copyUid}
          leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        >
          {copied ? 'Copied' : 'Copy User ID'}
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => void signOut()} leftIcon={<LogOut className="h-4 w-4" />}>Sign out</Button>
        <Button variant="ghost" onClick={() => window.location.reload()}>Check again</Button>
      </div>
    </StateShell>
  )
}

export function AccountSuspended() {
  const { signOut, firebaseUser } = useAuth()
  return (
    <StateShell
      icon={<ShieldAlert className="h-7 w-7" />}
      title="Staff access is suspended"
      description={`The profile for ${firebaseUser?.email ?? 'this account'} is inactive. A Super Admin must reactivate it before you can use the management system.`}
    >
      <Button className="mt-5" variant="outline" onClick={() => void signOut()} leftIcon={<LogOut className="h-4 w-4" />}>
        Sign out
      </Button>
    </StateShell>
  )
}

export function AuthErrorState() {
  const { error, signOut, clearError } = useAuth()
  return (
    <StateShell
      icon={<WifiOff className="h-7 w-7" />}
      title="Could not open the workspace"
      description={error ?? 'The connection to Firebase failed.'}
    >
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={clearError}>Retry</Button>
        <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
      </div>
    </StateShell>
  )
}

export function ConfigMissing() {
  const [params] = useSearchParams()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ivory-50 px-4 py-10">
      <div className="surface-card w-full max-w-lg p-7 text-center">
        <div className="flex justify-center"><LogoMark size={52} /></div>
        <h1 className="mt-4 font-display text-2xl font-semibold">Workspace unavailable</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          This deployment cannot connect to its workspace. Contact the system administrator to finish the installation.
        </p>
        <p className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-3 text-left text-xs leading-relaxed text-gold-900">
          Never share your password, and never place a service-account key in this application or in hosting environment variables.
        </p>
        {params.get('reason') === 'config' && <p className="mt-3 text-xs text-ink-500">The connection settings are incomplete.</p>}
        <Button className="mt-5" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  )
}
