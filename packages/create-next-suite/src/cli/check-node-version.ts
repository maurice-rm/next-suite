import semver from 'semver'

/** Answers why this Node.js version cannot run create-next-suite, or nothing when it can. */
export const findNodeVersionProblem = (current: string, required: string): string | undefined =>
  semver.satisfies(current, required)
    ? undefined
    : `create-next-suite needs Node ${required} — you are on v${current}. Please upgrade Node and try again.`
