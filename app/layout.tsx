import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import NavBar from '../components/NavBar'
import Sidebar from '../components/Sidebar'
import AutoRefresh from '../components/AutoRefresh'
import { getServerSupabase } from '../lib/supabase/server'

const inter = Inter({ subsets: ['latin'] })

export const revalidate = 0

export const metadata: Metadata = {
  title: 'ProGuard Claims Management',
  description: 'Internal claims management dashboard',
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
      <body className={inter.className}>
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
