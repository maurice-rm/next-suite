import { describe, expect, it } from 'vitest'

import { planV2Project } from './plan-v2-project.ts'

describe('planV2Project', () => {
  it('refuses a plugin that is none of the built-in plugins', () => {
    expect(() =>
      planV2Project({
        assets: { baseFiles: new Map(), plugins: [] },
        projectName: 'my-app',
        answers: { plugins: [{ name: 'mail', category: undefined }], settings: {}, options: {} },
        recordedAnswers: {},
        cliVersion: '0.0.0',
        createdAt: new Date(0),
      }),
    ).toThrow(
      'mail comes from --plugin, which NEXT_SUITE_ENGINE=v2 does not run yet; unset NEXT_SUITE_ENGINE to use it',
    )
  })
})
