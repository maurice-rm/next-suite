import { definePlugin } from 'create-next-suite/plugin'
import { createHealthChecks } from 'create-next-suite/points'

const ROUTE_FILE = '@/app/api/health/route.ts'
const CHECKS_VARIABLE = 'checks'

/** The checks as the code of an array of name and function, one per line. */
const checkList = (entries: readonly (readonly [string, string])[]): string =>
  entries.length === 0
    ? '[]'
    : ['[', ...entries.map(([name, run]) => `  [${JSON.stringify(name)}, ${run}],`), ']'].join('\n')

export default definePlugin({
  name: 'health',
  title: 'Health route',
  description: 'Answers GET /api/health with 200 while every check passes, 503 otherwise.',
  files: { [ROUTE_FILE]: 'files/route.ts' },
  collects: {
    health: {
      create: createHealthChecks,
      finish: (health, { module }) => {
        const route = module(ROUTE_FILE)
        const checks = health.checks()
        for (const { run } of checks) {
          route.addImport({ names: [run.name], from: run.from })
        }
        route.setVariable(
          CHECKS_VARIABLE,
          checkList(checks.map(({ name, run }) => [name, run.name] as const)),
        )
      },
    },
  },
})
