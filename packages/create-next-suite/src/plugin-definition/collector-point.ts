/**
 * The collector points by name, each with the type of what its provider collects. A point module
 * adds its entry by module augmentation.
 *
 * @example
 * ```ts
 * declare module 'create-next-suite/plugin' {
 *   interface CollectorPoints {
 *     csp: { allow: (directive: string, ...sources: string[]) => void }
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: point modules fill it by module augmentation
export interface CollectorPoints {}

export type CollectorPointName = keyof CollectorPoints

/**
 * A point where information flows from the users to one provider: the provider creates a
 * collector under `collects`, other plugins contribute to it under `extend`, and the provider
 * finishes what it collected into files once every contribution is in.
 *
 * @typeParam Name - The point's name, a key of {@link CollectorPoints}.
 */
export type CollectorPoint<Name extends CollectorPointName = CollectorPointName> = {
  readonly kind: 'collector'
  readonly name: Name
}

/**
 * Declares a collector point; at run time it is only its name, its type comes from
 * {@link CollectorPoints}.
 *
 * @typeParam Name - The point's name, a key of {@link CollectorPoints}.
 * @param name - The name under which the provider collects and the users contribute.
 * @returns The point, for `uses: { csp }`, which requires a provider, and `optional(csp)`.
 *
 * @example
 * ```ts
 * export const csp = defineCollectorPoint('csp')
 * ```
 */
export const defineCollectorPoint = <const Name extends CollectorPointName>(
  name: Name,
): CollectorPoint<Name> => ({ kind: 'collector', name })
