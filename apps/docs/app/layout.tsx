import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Provider } from '@/components/provider'
import './global.css'

export const metadata: Metadata = {
  title: { default: 'next-suite', template: '%s · next-suite' },
}

export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
