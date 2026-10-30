import { definePlugin } from 'create-next-suite/plugin'

const SITE_URL_VARIABLE = 'NEXT_PUBLIC_SITE_URL'
const LOCAL_URL = 'http://localhost:3000'
const SITE_URL_FILE = '@/lib/site-url.ts'
/** The plugin whose `env` the site URL is read from, when it is selected. */
const ENV_VALIDATION = 't3-env'

export default definePlugin({
  name: 'seo',
  title: 'SEO',
  description: 'Adds robots.txt, a sitemap and the site URL for metadata.',
  category: 'seo',
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
  files: ({ has }) => ({
    [SITE_URL_FILE]: has(ENV_VALIDATION) ? 'files/lib/site-url.t3-env.ts' : 'files/lib/site-url.ts',
    '@/app/robots.ts': 'files/app/robots.ts',
    '@/app/sitemap.ts': 'files/app/sitemap.ts',
  }),
})
