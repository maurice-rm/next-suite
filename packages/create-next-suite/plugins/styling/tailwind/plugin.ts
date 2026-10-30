import { definePlugin } from 'create-next-suite/plugin'

const VERSIONS = {
  tailwindcss: '4.3.3',
  '@tailwindcss/postcss': '4.3.3',
  'prettier-plugin-tailwindcss': '0.8.1',
}
const PRETTIER_PLUGIN = 'prettier-plugin-tailwindcss'

export default definePlugin({
  name: 'tailwind',
  title: 'Tailwind CSS',
  description: 'Styles with Tailwind CSS v4 through PostCSS.',
  category: 'styling',
  devDependencies: ({ has }) => ({
    tailwindcss: VERSIONS.tailwindcss,
    '@tailwindcss/postcss': VERSIONS['@tailwindcss/postcss'],
    ...(has('prettier') ? { [PRETTIER_PLUGIN]: VERSIONS[PRETTIER_PLUGIN] } : {}),
  }),
  css: { imports: ['tailwindcss'] },
  stack: ['Tailwind'],
  extend: {
    prettierPlugins: (plugins) => plugins.add(PRETTIER_PLUGIN),
  },
  files: { 'postcss.config.mjs': 'files/postcss.config.mjs' },
})
