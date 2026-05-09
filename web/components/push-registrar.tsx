'use client'

import { useEffect } from 'react'
import { ensurePushSubscription } from '@/lib/push'

export function PushRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(() => ensurePushSubscription())
        .catch(() => {})
    }
  }, [])
  return null
}
