import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/sidebar'
import { MobileNav } from '@/components/mobile-nav'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Drift',
  description: 'Your ADHD daily companion',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Drift',
  },
}

export const viewport: Viewport = {
  themeColor: '#080d1a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {children}
        </main>
        <MobileNav />
      </body>
    </html>
  )
}
