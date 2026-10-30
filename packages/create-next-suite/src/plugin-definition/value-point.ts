/**
 * The value points by name, each with the type of the value its provider states. A point module
 * adds its entry by module augmentation.
 *
 * @example
 * ```ts
 * declare module 'create-next-suite/plugin' {
 *   interface ValuePoints {
 *     orm: { kind: 'drizzle' | 'prisma'; client: { name: string; from: string } }
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: point modules fill it by module augmentation
export interface ValuePoints {}

export type ValuePointName = keyof ValuePoints

/**
 * A point where information flows from one provider to its users: the provider states a value
 * under `provides`, every plugin that names the point under `uses` reads it.
 *
 * @typeParam Name - The point's name, a key of {@link ValuePoints}.
 */
export type ValuePoint<Name extends ValuePointName = ValuePointName> = {
  readonly kind: 'value'
  readonly name: Name
}

/**
 * Declares a value point; at run time it is only its name, its type comes from
 * {@link ValuePoints}.
 *
 * @typeParam Name - The point's name, a key of {@link ValuePoints}.
 * @param name - The name under which providers state the value and users read it.
 * @returns The point, for `uses: { orm }` and `optional(orm)`.
 *
 * @example
 * ```ts
 * export const orm = defineValuePoint('orm')
 * ```
 */
export const defineValuePoint = <const Name extends ValuePointName>(
  name: Name,
): ValuePoint<Name> => ({ kind: 'value', name })
