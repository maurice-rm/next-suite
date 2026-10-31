import { definePlugin } from 'create-next-suite/plugin'
import { createCiChecks } from 'create-next-suite/points'

const WORKFLOW_FILE = '.github/workflows/ci.yml'
const WORKFLOW_SOURCE = 'files/ci.yml'
/** The lines of the workflow the package manager changes; the file is written for npm. */
const SETUP_NODE = '      - uses: actions/setup-node@'
const NODE_VERSION = '          node-version: 24\n'
const INSTALL = '      - run: npm ci\n'
const BUILD = '      - run: npm run build\n'
/** The check of the base project, which runs first. */
const BASE_CHECKS = ['typecheck']
/** The script that runs last, after every check. */
const BUILD_SCRIPT = 'build'

/** The steps that set up a package manager around the setup of Node.js, as lines. */
type SetupSteps = { beforeNode: readonly string[]; afterNode: readonly string[] }

const setupStepsOf = (name: string, version: string | undefined): SetupSteps => {
  switch (name) {
    case 'pnpm':
      return {
        beforeNode: [
          '      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0',
        ],
        afterNode: [],
      }
    case 'bun':
      return {
        beforeNode: [
          '      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0',
          '        with:',
          `          bun-version: ${version}`,
        ],
        afterNode: [],
      }
    case 'yarn':
      return { beforeNode: [], afterNode: ['      - run: corepack enable'] }
    default:
      return { beforeNode: [], afterNode: [] }
  }
}

const linesOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join('')

/** The workflow with `anchor` replaced; a workflow without it is a bug of this plugin. */
const replaceOnce = (workflow: string, anchor: string, replacement: string): string => {
  const start = workflow.indexOf(anchor)
  if (start === -1) {
    throw new Error(`${WORKFLOW_SOURCE} has no line "${anchor.trim()}"`)
  }
  return `${workflow.slice(0, start)}${replacement}${workflow.slice(start + anchor.length)}`
}

export default definePlugin({
  name: 'github-actions',
  title: 'GitHub Actions',
  description: 'Runs the checks of the project on every push and pull request with GitHub Actions.',
  category: 'ci',
  stack: ['GitHub Actions'],
  collects: {
    ciChecks: {
      create: createCiChecks,
      finish: (checks, { readFile, write, packageManager, scripts, fail }) => {
        const names = [...new Set([...BASE_CHECKS, ...checks.scripts()])].filter(
          (script) => script !== BUILD_SCRIPT,
        )
        for (const script of names) {
          if (!Object.hasOwn(scripts, script)) {
            fail(`CI runs the script "${script}", but no plugin defines it`)
          }
        }
        const { beforeNode, afterNode } = setupStepsOf(packageManager.name, packageManager.version)
        const runs = [...names, BUILD_SCRIPT].map(
          (script) => `      - run: ${packageManager.run} ${script}`,
        )
        let workflow = readFile(WORKFLOW_SOURCE)
        workflow = replaceOnce(workflow, SETUP_NODE, `${linesOf(beforeNode)}${SETUP_NODE}`)
        workflow = replaceOnce(workflow, NODE_VERSION, `${NODE_VERSION}${linesOf(afterNode)}`)
        workflow = replaceOnce(
          workflow,
          INSTALL,
          linesOf([`      - run: ${packageManager.ciInstall}`]),
        )
        workflow = replaceOnce(workflow, BUILD, linesOf(runs))
        write(WORKFLOW_FILE, workflow)
      },
    },
  },
})
