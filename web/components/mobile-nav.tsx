'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, Brain, LayoutDashboard, ListChecks, PenLine, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/',          icon: LayoutDashboard, label: 'Today'     },
  { href: '/log',       icon: PenLine,         label: 'Log'       },
  { href: '/capture',   icon: Brain,           label: 'Capture'   },
  { href: '/focus',     icon: Timer,           label: 'Focus'     },
  { href: '/breakdown', icon: ListChecks,      label: 'Tasks'     },
  { href: '/insights',  icon: BarChart2,       label: 'Insights'  },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-sidebar/95 backdrop-blur border-t border-border"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
    >
      <div className="flex px-3">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                active ? 'bg-primary/15' : 'bg-transparent'
              )}>
                <Icon className="w-4 h-4" />
              </div>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
