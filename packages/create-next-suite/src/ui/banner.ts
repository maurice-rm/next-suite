import ansis from 'ansis'
import semver from 'semver'

import { brand } from './theme.ts'

const WORDMARK = [
  '███╗   ██╗███████╗██╗  ██╗████████╗    ███████╗██╗   ██╗██╗████████╗███████╗',
  '████╗  ██║██╔════╝╚██╗██╔╝╚══██╔══╝    ██╔════╝██║   ██║██║╚══██╔══╝██╔════╝',
  '██╔██╗ ██║█████╗   ╚███╔╝    ██║       ███████╗██║   ██║██║   ██║   █████╗',
  '██║╚██╗██║██╔══╝   ██╔██╗    ██║       ╚════██║██║   ██║██║   ██║   ██╔══╝',
  '██║ ╚████║███████╗██╔╝ ██╗   ██║       ███████║╚██████╔╝██║   ██║   ███████╗',
  '╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝   ╚═╝       ╚══════╝ ╚═════╝ ╚═╝   ╚═╝   ╚══════╝',
]

/** Column where "SUITE" begins; the wordmark is two-tone across it. */
const SUITE_COLUMN = 37
const WORDMARK_WIDTH = Math.max(...WORDMARK.map((line) => line.length))
const TAGLINE_START = 'A better starting point for '
const TAGLINE_END = 'Next.js.'
const SEPARATOR = '  ·  '

type BannerInput = {
  version: string
  /** The latest published version, if the registry answered. */
  latest: string | undefined
  repositoryLink: string
  columns: number
}

const center = (styled: string, width: number): string =>
  ' '.repeat(Math.max(0, Math.floor((width - ansis.strip(styled).length) / 2))) + styled

const tagline = (): string => ansis.dim(TAGLINE_START) + brand.bold(TAGLINE_END)

/** The version, with "(latest)" or the newer version when the registry answered. */
const versionTag = (version: string, latest: string | undefined): string => {
  const tag = ansis.bold(`v${version}`)
  if (latest === undefined || !semver.valid(latest) || !semver.valid(version)) {
    return tag
  }
  if (semver.gt(latest, version)) {
    return `${tag}${ansis.dim(' (update available → ')}${brand.bold(`v${latest}`)}${ansis.dim(')')}`
  }
  return `${tag}${brand.bold(' (latest)')}`
}

const metaStrip = (version: string, repositoryLink: string | undefined): string =>
  repositoryLink === undefined
    ? version
    : `${version}${ansis.dim(SEPARATOR)}${brand(repositoryLink)}`

/**
 * The banner shown when the wizard starts: a two-tone wordmark, the tagline, version and link,
 * centred, with a hint when a newer version is out. A terminal narrower than the wordmark gets the
 * name in one line and the version only.
 */
export const renderBanner = ({ version, latest, repositoryLink, columns }: BannerInput): string => {
  const isNarrow = columns < WORDMARK_WIDTH
  const width = isNarrow ? columns : WORDMARK_WIDTH
  const title = isNarrow
    ? center(brand.bold('next') + ansis.bold('-suite'), width)
    : WORDMARK.map(
        (line) => brand.bold(line.slice(0, SUITE_COLUMN)) + ansis.bold(line.slice(SUITE_COLUMN)),
      ).join('\n')
  const meta = metaStrip(versionTag(version, latest), isNarrow ? undefined : repositoryLink)
  return ['', title, '', center(tagline(), width), '', center(meta, width), '', ''].join('\n')
}
