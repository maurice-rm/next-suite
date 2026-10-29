import ansis from 'ansis'

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
  link: string
  columns: number
}

const center = (styled: string, visibleLength: number, width: number): string =>
  ' '.repeat(Math.max(0, Math.floor((width - visibleLength) / 2))) + styled

const tagline = (): string => ansis.dim(TAGLINE_START) + brand.bold(TAGLINE_END)

const metaStrip = (
  version: string,
  link: string | undefined,
): { styled: string; length: number } => {
  const tag = `v${version}`
  if (link === undefined) {
    return { styled: ansis.bold(tag), length: tag.length }
  }
  return {
    styled: `${ansis.bold(tag)}${ansis.dim(SEPARATOR)}${brand(link)}`,
    length: tag.length + SEPARATOR.length + link.length,
  }
}

/**
 * The banner shown when the wizard starts: a two-tone wordmark, the tagline, version and link,
 * centred; terminals narrower than the wordmark get the name in one line and the version only.
 */
export const renderBanner = ({ version, link, columns }: BannerInput): string => {
  const isNarrow = columns < WORDMARK_WIDTH
  const width = isNarrow ? columns : WORDMARK_WIDTH
  const title = isNarrow
    ? center(brand.bold('next') + ansis.bold('-suite'), 'next-suite'.length, width)
    : WORDMARK.map(
        (line) => brand.bold(line.slice(0, SUITE_COLUMN)) + ansis.bold(line.slice(SUITE_COLUMN)),
      ).join('\n')
  const meta = metaStrip(version, isNarrow ? undefined : link)
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
