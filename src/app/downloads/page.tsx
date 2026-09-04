import Link from 'next/link'
import { Smartphone, Monitor, Apple, ArrowRight, Clock3 } from 'lucide-react'
import Logo from '@/components/marketing/Logo'
import {
  mbfButtonNav,
  mbfButtonGhostNav,
  mbfButtonSecondary,
  mbfPageBg,
  mbfGlow,
  mbfCard,
} from '@/components/marketing/mbfTheme'

export const metadata = {
  title: 'Download My Biz Flow',
  description: 'Install My Biz Flow as an app on your phone, tablet, or computer — no app store needed.',
}

const STEPS: Record<string, { icon: typeof Smartphone; title: string; steps: string[] }> = {
  android: {
    icon: Smartphone,
    title: 'Android (Chrome)',
    steps: [
      'Open crm.angroup.in in Chrome.',
      'Tap the ⋮ menu in the top-right corner.',
      'Tap "Install app" (or "Add to Home screen").',
      'Confirm — My Biz Flow now opens like any other app, full-screen, from your home screen.',
    ],
  },
  ios: {
    icon: Apple,
    title: 'iPhone / iPad (Safari)',
    steps: [
      'Open crm.angroup.in in Safari (this only works in Safari, not Chrome, on iOS).',
      'Tap the Share icon (square with an arrow) at the bottom of the screen.',
      'Scroll down and tap "Add to Home Screen".',
      'Tap "Add" — My Biz Flow now appears as an app icon on your home screen.',
    ],
  },
  desktop: {
    icon: Monitor,
    title: 'Windows / Mac (Chrome or Edge)',
    steps: [
      'Open crm.angroup.in in Chrome or Edge.',
      'Click the install icon (a small monitor with a down arrow) in the address bar — or open the ⋮ menu and choose "Install My Biz Flow".',
      'Click "Install" — it now opens in its own window from your desktop/taskbar, just like a native app.',
    ],
  },
}

export default function DownloadsPage() {
  return (
    <div className={mbfPageBg}>
      <div aria-hidden className={`${mbfGlow('blue')} -right-40 -top-40 h-[36rem] w-[36rem]`} />
      <div aria-hidden className={`${mbfGlow('orange')} -left-40 top-52 h-[28rem] w-[28rem]`} />

      <nav className="relative z-10 w-full flex items-center justify-between px-6 sm:px-12 py-6">
        <Link href="/"><Logo className="!text-white" /></Link>
        <div className="flex items-center gap-3">
          <Link href="/track-workorder" className={mbfButtonGhostNav}>
            <Clock3 className="h-3.5 w-3.5" /> Track a Repair
          </Link>
          <Link href="/login" className={mbfButtonNav}>Sign in</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-10 pb-24">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">Take My Biz Flow anywhere</h1>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto">
            My Biz Flow installs straight from your browser as a real app — full-screen, on your home screen or
            desktop, no app store needed. Native Android/iOS store apps aren&apos;t built yet; this is how to install
            what&apos;s available today.
          </p>
          <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
            You&apos;ll see the sign-in screen when you open the link below — that&apos;s expected, not an error.
            The install/&quot;Add to Home Screen&quot; option works from there regardless of whether you&apos;re
            signed in yet; once installed, opening the app takes you straight to sign-in every time, same as now.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {Object.entries(STEPS).map(([key, group]) => (
            <div key={key} className={`${mbfCard} p-6`}>
              <group.icon className="h-6 w-6 text-sky-300 mb-3" />
              <h2 className="text-lg font-bold text-white mb-3">{group.title}</h2>
              <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
                {group.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <div className="text-center mt-14">
          <p className="text-gray-400 mb-4">Not signed up yet?</p>
          <Link href="/pricing" className={mbfButtonSecondary}>
            Start 15-Day Free Trial <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
