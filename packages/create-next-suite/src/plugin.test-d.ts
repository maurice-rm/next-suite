import { describe, expectTypeOf, it } from 'vitest'

import {
  type BuiltDependencies,
  type CollectorPoints,
  createBuiltDependencies,
  createCiChecks,
  createLintIgnores,
  defineCollectorPoint,
  definePlugin,
  defineValuePoint,
  type FinishContext,
  type ObjectLiteral,
  optional,
  type Plugin,
  type PluginContext,
  type Precondition,
  type PreconditionContext,
  type TypescriptModule,
  type ValuePoint,
} from './plugin.ts'

declare module './plugin-definition/value-point.ts' {
  interface ValuePoints {
    greeting: { text: string }
  }
}

declare module './plugin-definition/collector-point.ts' {
  interface CollectorPoints {
    guestbook: { sign: (name: string) => void }
  }
}

const greeting = defineValuePoint('greeting')
const guestbook = defineCollectorPoint('guestbook')

describe('create-next-suite/plugin', () => {
  it('answers a Plugin from definePlugin', () => {
    expectTypeOf(definePlugin({ name: 'acme', title: 'Acme' })).toEqualTypeOf<Plugin>()
  })

  it('types the points a plugin defines, uses, provides and extends', () => {
    expectTypeOf(greeting).toEqualTypeOf<ValuePoint<'greeting'>>()
    definePlugin({
      name: 'host',
      title: 'Host',
      provides: { greeting: { text: 'hello' } },
      collects: {
        guestbook: {
          create: () => ({ sign: () => undefined }),
          finish: (collected, context) => {
            expectTypeOf(collected).toEqualTypeOf<CollectorPoints['guestbook']>()
            expectTypeOf(context.module).returns.toEqualTypeOf<TypescriptModule>()
          },
        },
      },
    })
    definePlugin({
      name: 'guest',
      title: 'Guest',
      uses: { greeting, guestbook: optional(guestbook) },
      readme: ({ greeting, guestbook }) => {
        expectTypeOf(greeting.text).toEqualTypeOf<string>()
        expectTypeOf(guestbook).toEqualTypeOf<true | undefined>()
        return {}
      },
      extend: { guestbook: (collector) => collector.sign('guest') },
    })
  })

  it('names the contexts of the functions of a plugin', () => {
    type Uses = { greeting: typeof greeting }
    expectTypeOf<PluginContext<Uses, object>['greeting']>().toEqualTypeOf<{ text: string }>()
    expectTypeOf<FinishContext<Uses, object>['module']>().returns.toEqualTypeOf<TypescriptModule>()
    expectTypeOf<TypescriptModule['object']>().returns.toEqualTypeOf<ObjectLiteral>()
  })

  it('answers a precondition with true or the reason', () => {
    expectTypeOf<Precondition>().parameter(0).toEqualTypeOf<PreconditionContext>()
    expectTypeOf<Precondition>().returns.toEqualTypeOf<true | string>()
  })

  it('creates the collectors of the shared points', () => {
    expectTypeOf(createBuiltDependencies).returns.toEqualTypeOf<BuiltDependencies>()
    expectTypeOf(createCiChecks).returns.toEqualTypeOf<CollectorPoints['ciChecks']>()
    expectTypeOf(createLintIgnores).returns.toEqualTypeOf<CollectorPoints['lintIgnores']>()
  })
})
