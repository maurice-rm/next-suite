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
  link: string
  columns: number
}

const center = (styled: string, visibleLength: number, width: number): string =>
  ' '.repeat(Math.max(0, Math.floor((width - visibleLength) / 2))) + styled

const tagline = (): string => ansis.dim(TAGLINE_START) + brand.bold(TAGLINE_END)

type Styled = { styled: string; length: number }

/** The version, with "(latest)" or the newer version when the registry answered. */
const versionTag = (version: string, latest: string | undefined): Styled => {
  const tag = `v${version}`
  if (latest === undefined || !semver.valid(latest) || !semver.valid(version)) {
    return { styled: ansis.bold(tag), length: tag.length }
  }
  if (semver.gt(latest, version)) {
    const opening = ' (update available → '
    const newer = `v${latest}`
    return {
      styled: `${ansis.bold(tag)}${ansis.dim(opening)}${brand.bold(newer)}${ansis.dim(')')}`,
      length: tag.length + opening.length + newer.length + 1,
    }
  }
  const current = ' (latest)'
  return { styled: `${ansis.bold(tag)}${brand.bold(current)}`, length: tag.length + current.length }
}

const metaStrip = (version: Styled, link: string | undefined): Styled =>
  link === undefined
    ? version
    : {
        styled: `${version.styled}${ansis.dim(SEPARATOR)}${brand(link)}`,
        length: version.length + SEPARATOR.length + link.length,
      }

/**
 * The banner shown when the wizard starts: a two-tone wordmark, the tagline, version and link,
 * centred, with a hint when a newer version is out; terminals narrower than the wordmark get the name in one line and the version only.
 */
export const renderBanner = ({ version, latest, link, columns }: BannerInput): string => {
  const isNarrow = columns < WORDMARK_WIDTH
  const width = isNarrow ? columns : WORDMARK_WIDTH
  const title = isNarrow
    ? center(brand.bold('next') + ansis.bold('-suite'), 'next-suite'.length, width)
    : WORDMARK.map(
        (line) => brand.bold(line.slice(0, SUITE_COLUMN)) + ansis.bold(line.slice(SUITE_COLUMN)),
      ).join('\n')
  const meta = metaStrip(versionTag(version, latest), isNarrow ? undefined : link)
  return [
    '',
    title,
    '',
    center(tagline(), TAGLINE_START.length + TAGLINE_END.length, width),
    '',
    center(meta.styled, meta.length, width),
    '',
    '',
  ].join('\n')
}
