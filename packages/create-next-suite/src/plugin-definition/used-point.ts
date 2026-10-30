import type { CollectorPoint, CollectorPointName } from './collector-point.ts'
import type { ValuePoint, ValuePointName, ValuePoints } from './value-point.ts'

/** A value point or a collector point. */
export type Point = ValuePoint | CollectorPoint

/**
 * A point a plugin uses only when some selected plugin provides it.
 *
 * @typeParam Used - The point.
 */
export type OptionalPoint<Used extends Point = Point> = {
  readonly point: Used
  readonly isOptional: true
}

/** A point under `uses`: required as it is, or wrapped in `optional()`. */
export type UsedPoint = Point | OptionalPoint

type PointValue<Used extends Point> =
  Used extends ValuePoint<infer Name extends ValuePointName>
    ? ValuePoints[Name]
    : Used extends CollectorPoint<CollectorPointName>
      ? true
      : never

/**
 * What a plugin reads of a point it uses: the value of a value point, `true` for a collector
 * point, `undefined` as well for an optional point.
 *
 * @typeParam Used - The point as `uses` names it.
 */
export type UsedValue<Used extends UsedPoint> =
  Used extends OptionalPoint<infer Inner>
    ? PointValue<Inner> | undefined
    : Used extends Point
      ? PointValue<Used>
      : never

export const pointOf = (used: UsedPoint): Point => ('point' in used ? used.point : used)

export const isOptionalUse = (used: UsedPoint): boolean => 'isOptional' in used
