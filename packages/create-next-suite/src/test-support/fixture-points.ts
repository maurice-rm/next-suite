import { defineCollectorPoint } from '../plugin-definition/collector-point.ts'
import { defineValuePoint } from '../plugin-definition/value-point.ts'

export type Dialect = 'postgresql' | 'sqlite'

export type OrmKind = 'drizzle' | 'prisma'

type Database = { dialect: Dialect }

type Orm = { kind: OrmKind; dialect: Dialect; client: { name: string; from: string } }

type CspDirective = 'script-src' | 'connect-src' | 'img-src'

/** What the CSP point collects: allowed sources per directive. */
export type CspSources = {
  allow: (directive: CspDirective, ...sources: string[]) => void
  directives: () => ReadonlyMap<CspDirective, readonly string[]>
}

declare module '../plugin-definition/value-point.ts' {
  interface ValuePoints {
    database: Database
    orm: Orm
  }
}

declare module '../plugin-definition/collector-point.ts' {
  interface CollectorPoints {
    csp: CspSources
  }
}

export const database = defineValuePoint('database')

export const orm = defineValuePoint('orm')

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
