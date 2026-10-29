'use client'

import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'

import { StaticSearchDialog } from './search'

export const Provider = ({ children }: { children: ReactNode }): ReactNode => (
  <RootProvider search={{ SearchDialog: StaticSearchDialog }}>{children}</RootProvider>
)
