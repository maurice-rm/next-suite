import { createTwoFilesPatch } from 'diff'

import type { ProjectPlan } from './project-plan.ts'

const NEW_FILE = '/dev/null'
const EMPTY_SOURCE = ''

const countLines = (content: string): number => {
  if (content === '') {
    return 0
  }
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
}

const describeLines = (content: string): string => {
  const count = countLines(content)
  return `${count} ${count === 1 ? 'line' : 'lines'}`
}

const describePackages = (title: string, packages: Record<string, string>): string[] => {
  const entries = Object.entries(packages)
  return entries.length === 0
    ? []
    : [title, ...entries.map(([name, version]) => `  ${name} ${version}`)]
}

/** Lists what a run would create: every file with its line count and plugin, then the packages. */
export const describePlan = (plan: ProjectPlan): string =>
  [
    'Files:',
    ...plan.files.map((file) => `  ${file.path} (${describeLines(file.content)}, ${file.origin})`),
    ...describePackages('Dependencies:', plan.dependencies),
    ...describePackages('Dev dependencies:', plan.devDependencies),
  ].join('\n')

/** Shows every file a run would create as a unified diff against an empty file. */
export const diffPlan = (plan: ProjectPlan): string =>
  plan.files
    .map((file) => createTwoFilesPatch(NEW_FILE, file.path, EMPTY_SOURCE, file.content))
    .join('\n')
