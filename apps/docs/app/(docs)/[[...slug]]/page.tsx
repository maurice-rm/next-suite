import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import { createRelativeLink } from 'fumadocs-ui/mdx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { getMdxComponents } from '@/components/mdx'
import { source } from '@/lib/source'

export default async function Page(props: PageProps<'/[[...slug]]'>): Promise<ReactNode> {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (page === undefined) {
    notFound()
  }

  const Mdx = page.data.body

  return (
    <DocsPage toc={page.data.toc} full={page.data.full ?? false}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Mdx components={getMdxComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams()
}

export async function generateMetadata(props: PageProps<'/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (page === undefined) {
    notFound()
  }

  return {
    title: page.data.title,
    description: page.data.description,
  }
}
