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
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar h-screen sticky top-0">
      {/* Brand */}
      <div className="px-5 pt-7 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
            <span className="text-base font-black italic text-white">d</span>
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-foreground">drift</span>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">ADHD companion</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                active ? 'bg-primary/20' : 'bg-transparent group-hover:bg-secondary'
              )}>
                <Icon className="w-4 h-4" />
              </div>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 text-[11px] text-muted-foreground/40">
        drift v0.3
      </div>
    </aside>
  )
}
