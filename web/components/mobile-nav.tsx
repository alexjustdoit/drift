'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, Brain, LayoutDashboard, PenLine, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/',         icon: LayoutDashboard, label: 'Today'   },
  { href: '/log',      icon: PenLine,         label: 'Log'     },
  { href: '/capture',  icon: Brain,           label: 'Capture' },
  { href: '/focus',    icon: Timer,           label: 'Focus'   },
  { href: '/insights', icon: BarChart2,       label: 'Insights'},
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-sidebar border-t border-border">
      <div className="flex">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-3 text-[11px] transition-colors',
              pathname === href ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
