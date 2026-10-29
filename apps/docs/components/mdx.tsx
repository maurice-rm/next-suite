import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'

export const getMdxComponents = (components?: MDXComponents): MDXComponents => ({
  ...defaultMdxComponents,
  ...components,
})
