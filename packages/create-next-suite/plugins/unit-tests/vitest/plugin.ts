import { definePlugin } from 'create-next-suite/plugin'

const VERSIONS = {
  vitest: '5.0.5',
  vite: '8.3.5',
  '@vitejs/plugin-react': '6.1.2',
  'vite-tsconfig-paths': '6.1.1',
  jsdom: '30.1.3',
  '@testing-library/react': '16.3.3',
  '@testing-library/dom': '10.4.2',
}
const CONFIG_FILE = 'vitest.config.mts'
const PAGE_TEST = '__tests__/page.test.tsx'
/** The heading of the base project's start page, which the test of the page looks for. */
const BASE_HEADING = '"next-suite-app"'

/** The setup files Vitest loads before the tests, as other plugins contribute them. */
type TestSetup = {
  /** Loads setup files before the tests, such as `vitest.setup.ts`. */
  add: (...paths: string[]) => void
  /** The setup files in the order they were first added. */
  paths: () => readonly string[]
}

declare module 'create-next-suite/plugin' {
  interface CollectorPoints {
    /** The setup files Vitest loads before the tests; the vitest plugin provides it. */
    testSetup: TestSetup
  }
}

const createTestSetup = (): TestSetup => {
  const paths = new Set<string>()
  return {
    add: (...added) => {
      for (const path of added) {
        paths.add(path)
      }
    },
    paths: () => [...paths],
  }
}

export default definePlugin({
  name: 'vitest',
  title: 'Vitest',
  description: 'Tests with Vitest and React Testing Library in jsdom.',
  category: 'unit-tests',
  devDependencies: VERSIONS,
  scripts: { test: 'vitest run', 'test:watch': 'vitest' },
  stack: ['Vitest'],
  extend: {
    ciChecks: (checks) => checks.run('test'),
  },
  files: { [CONFIG_FILE]: `files/${CONFIG_FILE}` },
  setup: (project, { readFile, projectName }) =>
    project.write(
      PAGE_TEST,
      readFile(`files/${PAGE_TEST}`).replace(BASE_HEADING, JSON.stringify(projectName)),
    ),
  collects: {
    testSetup: {
      create: createTestSetup,
      finish: (setup, { module }) => {
        const paths = setup.paths()
        if (paths.length > 0) {
          module(CONFIG_FILE)
            .defaultExportObject()
            .object('test')
            .addToArray('setupFiles', ...paths.map((path) => JSON.stringify(path)))
        }
      },
    },
  },
})
