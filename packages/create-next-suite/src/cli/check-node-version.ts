import semver from 'semver'

type NodeVersionCheck = { command: string; current: string; required: string }

/** Answers why this Node.js version cannot run a command of the package, or nothing when it can. */
export const findNodeVersionProblem = ({
  command,
  current,
  required,
}: NodeVersionCheck): string | undefined =>
  semver.satisfies(current, required, { includePrerelease: true })
    ? undefined
    : `${command} needs Node ${required} — you are on v${current}. Please upgrade Node and try again.`
