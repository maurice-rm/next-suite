import type { ValuePoints } from '../plugin-definition/value-point.ts'

export { csp, database, orm } from '../plugin-definition/shared-points.ts'

export type Dialect = ValuePoints['database']['dialect']

export type OrmKind = ValuePoints['orm']['kind']
