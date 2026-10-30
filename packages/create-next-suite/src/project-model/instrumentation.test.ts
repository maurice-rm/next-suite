import { describe, expect, it } from 'vitest'

import { createInstrumentation } from './instrumentation.ts'

describe('createInstrumentation', () => {
  it('renders no files when nothing is contributed', () => {
    const instrumentation = createInstrumentation()

    expect(instrumentation.renderServer()).toBeUndefined()
    expect(instrumentation.renderClient()).toBeUndefined()
  })

  it('renders register and onRequestError, each loading its modules lazily in Node.js', () => {
    const instrumentation = createInstrumentation()
    instrumentation.register({ module: '@/lib/otel' })
    instrumentation.register({ module: '@/lib/sentry', export: 'init' })
    instrumentation.onRequestError({ module: '@/lib/logger', export: 'reportRequestError' })
    instrumentation.register({ module: '@/lib/otel' })

    expect(instrumentation.renderServer()).toBe(
      [
        'import type { Instrumentation } from "next";',
        '',
        'export async function register() {',
        '  if (process.env.NEXT_RUNTIME !== "nodejs") {',
        '    return;',
        '  }',
        '  await import("@/lib/otel");',
        '  await (await import("@/lib/sentry")).init();',
        '}',
        '',
        'export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {',
        '  if (process.env.NEXT_RUNTIME !== "nodejs") {',
        '    return;',
        '  }',
        '  await (await import("@/lib/logger")).reportRequestError(error, request, context);',
        '};',
        '',
      ].join('\n'),
    )
  })

  it('renders instrumentation-client.ts with imports, then calls', () => {
    const instrumentation = createInstrumentation()
    instrumentation.addClient({ module: '@/lib/analytics', export: 'startAnalytics' })
    instrumentation.addClient({ module: '@/lib/polyfills' })

    expect(instrumentation.renderClient()).toBe(
      [
        'import { startAnalytics } from "@/lib/analytics";',
        'import "@/lib/polyfills";',
        '',
        'startAnalytics();',
        '',
      ].join('\n'),
    )
  })
})
