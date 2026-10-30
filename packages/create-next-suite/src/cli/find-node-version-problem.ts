import semver from 'semver'

type NodeVersionCheck = { command: string; current: string; required: string }

export const findNodeVersionProblem = ({
  command,
  current,
  required,
}: NodeVersionCheck): string | undefined =>
  semver.satisfies(current, required, { includePrerelease: true })
    ? undefined
    : `${command} needs Node ${required} — you are on v${current}. Please upgrade Node and try again.`
