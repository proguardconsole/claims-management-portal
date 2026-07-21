import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import NavBar from '../components/NavBar'
import Sidebar from '../components/Sidebar'
import AutoRefresh from '../components/AutoRefresh'
import { getServerSupabase } from '../lib/supabase/server'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const revalidate = 0

export const metadata: Metadata = {
  title: 'ProGuard Claims Management',
  description: 'Internal claims management dashboard',
  icons: {
    icon: 'https://septic.proguardplans.com/favicon.ico',
    shortcut: 'https://septic.proguardplans.com/favicon.ico',
    apple: 'https://septic.proguardplans.com/apple-touch-icon.png',
  },
}

async function getLastSynced(): Promise<string | null> {
  try {
    const supabase = getServerSupabase()
    const { data } = await supabase
      .from('claims')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()
    return data?.synced_at ?? null
  } catch {
    return null
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const lastSynced = await getLastSynced()

  return (
    <html lang="en">
      <body className={dmSans.className}>
        <NavBar />
        <Sidebar lastSynced={lastSynced} />

        {/* Main content — offset from fixed nav + sidebar */}
        <main
          style={{
            marginLeft: 220,
            marginTop: 52,
            minHeight: 'calc(100vh - 52px)',
            background: 'var(--bg-base)',
            padding: 24,
          }}
        >
          {children}
        </main>

        <AutoRefresh />
      </body>
    </html>
  )
}
