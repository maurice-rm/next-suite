import { describe, expect, it } from 'vitest'

import { instrumentationClientFile, instrumentationFile } from './instrumentation-files.ts'

describe('instrumentationFile', () => {
  it('writes nothing without contributions', () => {
    expect(instrumentationFile({ register: [], onRequestError: [] })).toBeUndefined()
  })

  it('loads register modules and error handlers lazily in the Node.js runtime', () => {
    const content = instrumentationFile({
      register: [{ module: '@/env' }],
      onRequestError: [{ module: '@/lib/logger', export: 'reportRequestError' }],
    })

    expect(content).toMatchInlineSnapshot(`
      "import type { Instrumentation } from "next";

      export async function register() {
        if (process.env.NEXT_RUNTIME !== "nodejs") {
          return;
        }
        await import("@/env");
      }

      export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
        if (process.env.NEXT_RUNTIME !== "nodejs") {
          return;
        }
        await (await import("@/lib/logger")).reportRequestError(error, request, context);
      };
      "
    `)
  })
})

describe('instrumentationClientFile', () => {
  it('imports side-effect modules and calls named exports', () => {
    expect(
      instrumentationClientFile([
        { module: '~/analytics' },
        { module: '~/vitals', export: 'reportVitals' },
      ]),
    ).toBe('import "~/analytics";\nimport { reportVitals } from "~/vitals";\n\nreportVitals();\n')
  })
})
