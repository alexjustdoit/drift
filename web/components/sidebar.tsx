'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, Brain, LayoutDashboard, ListChecks, PenLine, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/',           icon: LayoutDashboard, label: 'Today'     },
  { href: '/log',        icon: PenLine,         label: 'Log'       },
  { href: '/capture',    icon: Brain,           label: 'Capture'   },
  { href: '/focus',      icon: Timer,           label: 'Focus'     },
  { href: '/breakdown',  icon: ListChecks,      label: 'Breakdown' },
  { href: '/insights',   icon: BarChart2,       label: 'Insights'  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-sidebar h-screen sticky top-0">
      <div className="px-5 pt-6 pb-4">
        <span className="text-xl font-bold tracking-tight text-primary">drift</span>
        <p className="text-xs text-muted-foreground mt-0.5">your ADHD companion</p>
      </div>

      <nav className="flex-1 px-3 flex flex-col gap-0.5">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              pathname === href
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-5 py-4 text-[11px] text-muted-foreground/50">
        drift v0.3
      </div>
    </aside>
  )
}
