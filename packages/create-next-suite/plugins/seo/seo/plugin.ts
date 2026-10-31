import { definePlugin, optional } from 'create-next-suite/plugin'
import { readFromValidatedEnv, validatedEnv } from 'create-next-suite/points'

const SITE_URL_VARIABLE = 'NEXT_PUBLIC_SITE_URL'
const LOCAL_URL = 'http://localhost:3000'
const SITE_URL_FILE = '@/lib/site-url.ts'

export default definePlugin({
  name: 'seo',
  title: 'SEO',
  description: 'Adds robots.txt, a sitemap and the site URL for metadata.',
  category: 'seo',
  uses: { validatedEnv: optional(validatedEnv) },
  env: {
    [SITE_URL_VARIABLE]: {
      scope: 'client',
      example: LOCAL_URL,
      default: LOCAL_URL,
      description:
        'The public URL of the site, for absolute links in metadata, robots.txt and the sitemap.',
    },
  },
  layout: {
    metadata: {
      metadataBase: `new URL(process.env.${SITE_URL_VARIABLE} || ${JSON.stringify(LOCAL_URL)})`,
    },
  },
  files: {
    [SITE_URL_FILE]: {
      source: 'files/lib/site-url.ts',
      edit: (siteUrl, { validatedEnv }) =>
        readFromValidatedEnv(siteUrl, validatedEnv, { siteUrl: SITE_URL_VARIABLE }),
    },
    '@/app/robots.ts': 'files/app/robots.ts',
    '@/app/sitemap.ts': 'files/app/sitemap.ts',
  },
})
