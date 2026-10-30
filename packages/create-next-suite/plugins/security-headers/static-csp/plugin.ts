import { definePlugin } from 'create-next-suite/plugin'

const HEADERS_FILE = 'security-headers.ts'
const DIRECTIVES_OBJECT = 'directives'

/** The sources of the Content Security Policy by directive, as other plugins allow them. */
type CspSources = {
  /** Allows sources for a directive, such as `https://va.vercel-scripts.com` for `script-src`. */
  allow: (directive: string, ...sources: string[]) => void
  /** Each directive with its sources, in the order they were first allowed. */
  directives: () => ReadonlyMap<string, readonly string[]>
}

declare module 'create-next-suite/plugin' {
  interface CollectorPoints {
    /** The sources of the Content Security Policy; the static-csp plugin provides it. */
    csp: CspSources
  }
}

const createCspSources = (): CspSources => {
  const sources = new Map<string, Set<string>>()
  return {
    allow: (directive, ...allowed) => {
      const present = sources.get(directive) ?? new Set()
      for (const source of allowed) {
        present.add(source)
      }
      sources.set(directive, present)
    },
    directives: () =>
      new Map([...sources].map(([directive, allowed]) => [directive, [...allowed]])),
  }
}

/** The sources as a list of code, one per line, the way the file writes its own. */
const sourceList = (sources: readonly string[]): string =>
  ['[', ...sources.map((source) => `  ${JSON.stringify(source)},`), ']'].join('\n')

export default definePlugin({
  name: 'static-csp',
  title: 'Security headers',
  description: 'Sends a static Content Security Policy and the common security headers.',
  category: 'security-headers',
  files: { [HEADERS_FILE]: `files/${HEADERS_FILE}` },
  nextConfig: {
    imports: [{ names: ['securityHeaders'], from: './security-headers' }],
    options: { headers: 'async () => [{ source: "/(.*)", headers: securityHeaders }]' },
  },
  readme: {
    'Security headers':
      '`security-headers.ts` sets a static Content Security Policy and the common security headers for every route. HSTS leaves out `includeSubDomains`, so subdomains keep plain HTTP until you opt in.',
  },
  collects: {
    csp: {
      create: createCspSources,
      finish: (csp, { module }) => {
        const directives = module(HEADERS_FILE).object(DIRECTIVES_OBJECT)
        for (const [directive, sources] of csp.directives()) {
          if (directives.get(directive) === undefined) {
            directives.set(directive, sourceList(sources))
          } else {
            directives.addToArray(directive, ...sources.map((source) => JSON.stringify(source)))
          }
        }
      },
    },
  },
})
