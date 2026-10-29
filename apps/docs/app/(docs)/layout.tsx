import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'

import { baseOptions } from '@/lib/base-options'
import { source } from '@/lib/source'

export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  )
}
