import { definePlugin } from 'create-next-suite/plugin'
import { type Dialect, databaseSchema, type OrmKind, orm } from 'create-next-suite/points'

const BLOG_DIRECTORY = '@/app/blog'

/** The table of the posts for each ORM and dialect. */
const SCHEMA_FILES: Record<OrmKind, Record<Dialect, string>> = {
  drizzle: { postgresql: 'files/post.postgresql.ts', sqlite: 'files/post.sqlite.ts' },
  prisma: { postgresql: 'files/post.prisma', sqlite: 'files/post.prisma' },
}

export default definePlugin({
  name: 'blog',
  title: 'Blog',
  description: 'Lists the posts of a table under /blog.',
  uses: { orm, databaseSchema },
  files: ({ orm }) => ({
    [`${BLOG_DIRECTORY}/list-posts.ts`]: `files/list-posts.${orm.kind}.ts`,
    [`${BLOG_DIRECTORY}/page.tsx`]: 'files/page.tsx',
  }),
  extend: {
    databaseSchema: (schema, { orm, readFile }) =>
      schema.add('blog', readFile(SCHEMA_FILES[orm.kind][orm.dialect])),
  },
})
