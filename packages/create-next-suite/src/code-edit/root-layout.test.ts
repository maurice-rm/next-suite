import { describe, expect, it } from 'vitest'

import { CodeEditError } from './code-edit-error.ts'
import { openRootLayout } from './root-layout.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const LAYOUT_PATH = 'app/layout.tsx'

/** The root layout around `body`, a list of lines at the indentation of `<body>`. */
const layout = (...body: string[]): string =>
  source(
    'import type { Metadata } from "next";',
    'import "./globals.css";',
    '',
    'export const metadata: Metadata = {',
    '  description: "Created with create-next-suite",',
    '};',
    '',
    'export default function RootLayout({ children }: LayoutProps<"/">) {',
    '  return (',
    '    <html lang="en">',
    ...body.map((line) => `      ${line}`),
    '    </html>',
    '  );',
    '}',
  )

const BASE_LAYOUT = layout('<body>', '  {children}', '</body>')

describe('wrapChildren', () => {
  it('wraps {children} in a component with its props', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.wrapChildren([
      {
        component: 'ThemeProvider',
        props: {
          attribute: 'class',
          defaultTheme: 'system',
          enableSystem: true,
        },
      },
    ])

    expect(root.print()).toBe(
      layout(
        '<body>',
        '  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>',
        '    {children}',
        '  </ThemeProvider>',
        '</body>',
      ),
    )
  })

  it('puts a later wrapper inside an earlier one', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.wrapChildren([{ component: 'Outer' }])
    root.wrapChildren([{ component: 'Inner' }])

    expect(root.print()).toBe(
      layout(
        '<body>',
        '  <Outer>',
        '    <Inner>',
        '      {children}',
        '    </Inner>',
        '  </Outer>',
        '</body>',
      ),
    )
  })

  it('puts a wrapper inside the component it names, whatever the order', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.wrapChildren([
      { component: 'QueryProvider', inside: 'SessionProvider' },
      { component: 'ThemeProvider' },
      { component: 'SessionProvider' },
    ])

    expect(root.print()).toBe(
      layout(
        '<body>',
        '  <ThemeProvider>',
        '    <SessionProvider>',
        '      <QueryProvider>',
        '        {children}',
        '      </QueryProvider>',
        '    </SessionProvider>',
        '  </ThemeProvider>',
        '</body>',
      ),
    )
  })

  it('refuses wrappers that each want to go inside another', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)

    expect(() =>
      root.wrapChildren([
        { component: 'A', inside: 'B' },
        { component: 'B', inside: 'A' },
      ]),
    ).toThrow('app/layout.tsx: the wrappers A, B each want to go inside another')
  })

  it('wraps {children} inside a fragment', () => {
    const root = openRootLayout(LAYOUT_PATH, layout('<body>', '  <>{children}</>', '</body>'))
    root.wrapChildren([{ component: 'Providers' }])

    expect(root.print()).toBe(
      layout(
        '<body>',
        '  <>',
        '    <Providers>',
        '      {children}',
        '    </Providers>',
        '  </>',
        '</body>',
      ),
    )
  })

  it('lays out a body written on one line', () => {
    const root = openRootLayout(
      LAYOUT_PATH,
      layout('<body className="antialiased">{children}<Analytics /></body>'),
    )
    root.wrapChildren([{ component: 'Providers' }])

    expect(root.print()).toBe(
      layout(
        '<body className="antialiased">',
        '  <Providers>',
        '    {children}',
        '  </Providers>',
        '  <Analytics />',
        '</body>',
      ),
    )
  })

  it('lays out the children of a body that shares its line with <html>', () => {
    const text = BASE_LAYOUT.replace(
      /<html lang="en">[\s\S]*<\/html>/,
      '<html lang="en"><body>{children}</body></html>',
    )
    const root = openRootLayout(LAYOUT_PATH, text)
    root.wrapChildren([{ component: 'Providers' }])

    expect(root.print()).toBe(
      text.replace(
        '<body>{children}</body>',
        '<body>\n      <Providers>\n        {children}\n      </Providers>\n    </body>',
      ),
    )
  })

  it('keeps the inner lines of a sibling when it lays out the children', () => {
    const root = openRootLayout(
      LAYOUT_PATH,
      layout('<body>', '  <Header>', '    <Nav />', '  </Header>{children}', '</body>'),
    )
    root.wrapChildren([{ component: 'Providers' }])

    expect(root.print()).toBe(
      layout(
        '<body>',
        '  <Header>',
        '    <Nav />',
        '  </Header>',
        '  <Providers>',
        '    {children}',
        '  </Providers>',
        '</body>',
      ),
    )
  })

  it('indents with tabs in a file indented with tabs', () => {
    const text = source(
      'export default function RootLayout({ children }) {',
      '\treturn (',
      '\t\t<html lang="en">',
      '\t\t\t<body>',
      '\t\t\t\t{children}',
      '\t\t\t</body>',
      '\t\t</html>',
      '\t)',
      '}',
    )
    const root = openRootLayout(LAYOUT_PATH, text)
    root.wrapChildren([{ component: 'Providers' }])

    expect(root.print()).toBe(
      text.replace(
        '\t\t\t\t{children}\n',
        '\t\t\t\t<Providers>\n\t\t\t\t\t{children}\n\t\t\t\t</Providers>\n',
      ),
    )
  })

  it('writes a prop value with a double quote as an expression', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.wrapChildren([{ component: 'Banner', props: { text: 'say "hi"' } }])

    expect(root.print()).toContain('<Banner text={"say \\"hi\\""}>')
  })

  it('refuses a layout without {children} in <body> and names the file', () => {
    const root = openRootLayout(LAYOUT_PATH, layout('<body>', '  <main />', '</body>'))

    expect(() => root.wrapChildren([{ component: 'Providers' }])).toThrow(CodeEditError)
    expect(() => root.wrapChildren([{ component: 'Providers' }])).toThrow(
      'app/layout.tsx: found no {children} inside <body>',
    )
  })

  it('refuses a layout without <body>', () => {
    const root = openRootLayout(LAYOUT_PATH, layout('{children}'))

    expect(() => root.wrapChildren([{ component: 'Providers' }])).toThrow(
      'app/layout.tsx: found no <body> element',
    )
  })
})

describe('appendToBody', () => {
  it('adds an element as the last child of <body>', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.appendToBody('<Analytics />')

    expect(root.print()).toBe(layout('<body>', '  {children}', '  <Analytics />', '</body>'))
  })

  it('adds an element after a wrapper', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.wrapChildren([{ component: 'Providers' }])
    root.appendToBody('<Analytics />')

    expect(root.print()).toBe(
      layout(
        '<body>',
        '  <Providers>',
        '    {children}',
        '  </Providers>',
        '  <Analytics />',
        '</body>',
      ),
    )
  })

  it('opens an empty body into lines', () => {
    const root = openRootLayout(LAYOUT_PATH, layout('<body></body>'))
    root.appendToBody('<Analytics />')

    expect(root.print()).toBe(layout('<body>', '  <Analytics />', '</body>'))
  })

  it('refuses a self-closing <body> and names the file', () => {
    const root = openRootLayout(LAYOUT_PATH, layout('<body />'))

    expect(() => root.appendToBody('<Analytics />')).toThrow(
      'app/layout.tsx: <body> is self-closing and takes no children',
    )
  })

  it('indents a snippet that spans lines at the depth of <body>', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.appendToBody(
      '<Script\n  src="https://example.com/a.js"\n  strategy="afterInteractive"\n/>',
    )

    expect(root.print()).toBe(
      layout(
        '<body>',
        '  {children}',
        '  <Script',
        '    src="https://example.com/a.js"',
        '    strategy="afterInteractive"',
        '  />',
        '</body>',
      ),
    )
  })

  it('takes away the indentation a snippet brings from its own source', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.appendToBody('<Footer>\n          <Link />\n        </Footer>')

    expect(root.print()).toBe(
      layout('<body>', '  {children}', '  <Footer>', '    <Link />', '  </Footer>', '</body>'),
    )
  })
})

describe('setHtmlAttribute', () => {
  it('adds an attribute after the last one', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.setHtmlAttribute('suppressHydrationWarning', true)

    expect(root.print()).toBe(
      BASE_LAYOUT.replace('<html lang="en">', '<html lang="en" suppressHydrationWarning>'),
    )
  })

  it('replaces an existing attribute', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.setHtmlAttribute('lang', 'de')

    expect(root.print()).toBe(BASE_LAYOUT.replace('<html lang="en">', '<html lang="de">'))
  })

  it('adds an attribute to <html> without attributes', () => {
    const text = BASE_LAYOUT.replace('<html lang="en">', '<html>')
    const root = openRootLayout(LAYOUT_PATH, text)
    root.setHtmlAttribute('lang', 'en')

    expect(root.print()).toBe(BASE_LAYOUT)
  })

  it('puts the attribute on its own line when the attributes are on their own lines', () => {
    const text = BASE_LAYOUT.replace(
      '<html lang="en">',
      '<html\n      lang="en"\n      className={font.variable}\n    >',
    )
    const root = openRootLayout(LAYOUT_PATH, text)
    root.setHtmlAttribute('suppressHydrationWarning', true)

    expect(root.print()).toBe(
      text.replace(
        'className={font.variable}\n',
        'className={font.variable}\n      suppressHydrationWarning\n',
      ),
    )
  })
})

describe('metadata', () => {
  it('edits the exported metadata object', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.metadata().set('title', '{\ndefault: "app",\ntemplate: "%s | app",\n}')
    root.metadata().set('description', '"An app"')

    expect(root.print()).toBe(
      BASE_LAYOUT.replace(
        '  description: "Created with create-next-suite",\n',
        '  description: "An app",\n  title: {\n    default: "app",\n    template: "%s | app",\n  },\n',
      ),
    )
  })

  it('refuses a layout without metadata and names the file', () => {
    const root = openRootLayout(LAYOUT_PATH, source('export default function RootLayout() {}'))

    expect(() => root.metadata().set('title', '"a"')).toThrow(
      'app/layout.tsx: found no top-level variable "metadata" with a value',
    )
  })
})

describe('a root layout with several plugins', () => {
  it('combines imports, a wrapper, an element and an attribute', () => {
    const root = openRootLayout(LAYOUT_PATH, BASE_LAYOUT)
    root.addImport({ from: 'next-themes', names: ['ThemeProvider'] })
    root.addImport({ from: '@vercel/analytics/next', names: ['Analytics'] })
    root.wrapChildren([
      {
        component: 'ThemeProvider',
        props: {
          attribute: 'class',
          defaultTheme: 'system',
          enableSystem: true,
        },
      },
    ])
    root.appendToBody('<Analytics />')
    root.setHtmlAttribute('suppressHydrationWarning', true)

    expect(root.print()).toBe(
      source(
        'import type { Metadata } from "next";',
        'import { ThemeProvider } from "next-themes";',
        'import { Analytics } from "@vercel/analytics/next";',
        'import "./globals.css";',
        '',
        'export const metadata: Metadata = {',
        '  description: "Created with create-next-suite",',
        '};',
        '',
        'export default function RootLayout({ children }: LayoutProps<"/">) {',
        '  return (',
        '    <html lang="en" suppressHydrationWarning>',
        '      <body>',
        '        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>',
        '          {children}',
        '        </ThemeProvider>',
        '        <Analytics />',
        '      </body>',
        '    </html>',
        '  );',
        '}',
      ),
    )
  })
})
