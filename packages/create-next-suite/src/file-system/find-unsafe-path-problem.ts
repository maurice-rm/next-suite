const FIRST_PRINTABLE = 0x20
const DELETE = 0x7f
const WINDOWS_DRIVE = /^[a-zA-Z]:/
const MAX_DECODING_ROUNDS = 3
/** Segments compared in lower case, as case-insensitive file systems do. */
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(['', '.', '..', '.git'])

const isControlCharacter = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0
  return code < FIRST_PRINTABLE || code === DELETE
}

const decodeOnce = (path: string): string => {
  try {
    return decodeURIComponent(path)
  } catch (error) {
    if (error instanceof URIError) {
      return path
    }
    throw error
  }
}

const decodings = (path: string): string[] => {
  const forms = [path]
  for (let round = 0; round < MAX_DECODING_ROUNDS; round++) {
    const decoded = decodeOnce(forms.at(-1) ?? path)
    if (decoded === forms.at(-1)) {
      break
    }
    forms.push(decoded)
  }
  return forms
}

const describeProblem = (form: string): string | undefined => {
  if ([...form].some((character) => isControlCharacter(character))) {
    return 'contains a control character'
  }
  if (form.includes('\\')) {
    return 'contains a backslash; use forward slashes'
  }
  if (form.startsWith('/') || WINDOWS_DRIVE.test(form)) {
    return 'is absolute'
  }
  const segment = form.split('/').find((part) => FORBIDDEN_SEGMENTS.has(part.toLowerCase()))
  if (segment !== undefined) {
    return segment === '' ? 'contains an empty segment' : `contains the segment "${segment}"`
  }
  return undefined
}

/**
 * What makes a target path unsafe, or nothing: a path that could leave the project or reach into
 * its git repository, such as an absolute path, a `..`, `.` or `.git` segment, a backslash or a
 * control character, also after repeated URL decoding. Such a path is rejected, never cleaned up
 * into something else.
 */
export const findUnsafePathProblem = (target: string): string | undefined => {
  for (const form of decodings(target)) {
    const problem = describeProblem(form)
    if (problem !== undefined) {
      return problem
    }
  }
  return undefined
}
