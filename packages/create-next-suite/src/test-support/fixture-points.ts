import { defineCollectorPoint } from '../plugin-definition/collector-point.ts'
import type { ValuePoints } from '../plugin-definition/value-point.ts'

export { database, orm } from '../plugin-definition/shared-points.ts'

export type Dialect = ValuePoints['database']['dialect']

export type OrmKind = ValuePoints['orm']['kind']

type CspDirective = 'script-src' | 'connect-src' | 'img-src'

/** What the CSP point collects: allowed sources per directive. */
export type CspSources = {
  allow: (directive: CspDirective, ...sources: string[]) => void
  directives: () => ReadonlyMap<CspDirective, readonly string[]>
}

declare module '../plugin-definition/collector-point.ts' {
  interface CollectorPoints {
    csp: CspSources
  }
}

export const csp = defineCollectorPoint('csp')

export const createCspSources = (): CspSources => {
  const allowed = new Map<CspDirective, string[]>()
  return {
    allow: (directive, ...sources) => {
      const present = allowed.get(directive) ?? []
      allowed.set(directive, [...present, ...sources.filter((source) => !present.includes(source))])
    },
    directives: () => allowed,
  }
}
