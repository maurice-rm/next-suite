import { describe, expect, it } from 'vitest'

import { CodeEditError } from './code-edit-error.ts'
import type { ModuleImport } from './module-import.ts'
import { openTypescriptModule } from './typescript-module.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const addImport = (text: string, moduleImport: ModuleImport): string => {
  const module = openTypescriptModule('app/page.tsx', text)
  module.addImport(moduleImport)
  return module.print()
}

describe('addImport', () => {
  it('adds a named import after the last import that binds a name, before a stylesheet', () => {
    const text = source(
      'import type { Metadata } from "next";',
      'import "./globals.css";',
      '',
      'export const metadata: Metadata = {};',
    )

    expect(addImport(text, { from: 'next-themes', names: ['ThemeProvider'] })).toBe(
      source(
        'import type { Metadata } from "next";',
        'import { ThemeProvider } from "next-themes";',
        'import "./globals.css";',
        '',
        'export const metadata: Metadata = {};',
      ),
    )
  })

  it('adds a default import together with named ones', () => {
    const text = source('import { a } from "a";')

    expect(addImport(text, { from: 'b', defaultName: 'b', names: ['c', 'd'] })).toBe(
      source('import { a } from "a";', 'import b, { c, d } from "b";'),
    )
  })

  it('merges a name into an import of the same module', () => {
    const text = source('import { a } from "x";', '', 'a();')

    expect(addImport(text, { from: 'x', names: ['b'] })).toBe(
      source('import { a, b } from "x";', '', 'a();'),
    )
  })

  it('merges a name into an import that spans lines', () => {
    const text = source('import {', '  a,', '  b,', '} from "x";')

    expect(addImport(text, { from: 'x', names: ['c'] })).toBe(
      source('import {', '  a,', '  b,', '  c,', '} from "x";'),
    )
  })

  it('leaves the file untouched when the name is imported already', () => {
    const text = source('import { a, b } from "x";', '', 'a(b);')

    expect(addImport(text, { from: 'x', names: ['b', 'a'] })).toBe(text)
  })

  it('adds a default name to a named import', () => {
    const text = source('import { b } from "x";')

    expect(addImport(text, { from: 'x', defaultName: 'a' })).toBe(
      source('import a, { b } from "x";'),
    )
  })

  it('adds a name to a default import', () => {
    const text = source('import a from "x";')

    expect(addImport(text, { from: 'x', names: ['b'] })).toBe(source('import a, { b } from "x";'))
  })

  it('turns a bare import of the module into one with names', () => {
    const text = source('import "x";')

    expect(addImport(text, { from: 'x', names: ['a'] })).toBe(source('import { a } from "x";'))
  })

  it('adds a bare import after the last import', () => {
    const text = source('import { a } from "a";', 'import "./globals.css";', '', 'a();')

    expect(addImport(text, { from: './theme.css' })).toBe(
      source(
        'import { a } from "a";',
        'import "./globals.css";',
        'import "./theme.css";',
        '',
        'a();',
      ),
    )
  })

  it('leaves the file untouched for a bare import of a module imported already', () => {
    const text = source('import { a } from "x";')

    expect(addImport(text, { from: 'x' })).toBe(text)
  })

  it('refuses a second default name for the same module and names file and module', () => {
    const module = openTypescriptModule('lib/logger.ts', source('import pino from "pino";'))

    expect(() => module.addImport({ from: 'pino', defaultName: 'logger' })).toThrow(CodeEditError)
    expect(() => module.addImport({ from: 'pino', defaultName: 'logger' })).toThrow(
      'lib/logger.ts: the default export of "pino" is imported as pino already, not as logger',
    )
  })

  it('keeps a value import apart from a type import of the same module', () => {
    const text = source('import type { Metadata } from "next";', '', 'export const a = 1;')

    expect(addImport(text, { from: 'next', names: ['Viewport'] })).toBe(
      source(
        'import type { Metadata } from "next";',
        'import { Viewport } from "next";',
        '',
        'export const a = 1;',
      ),
    )
  })

  it('merges a type import into a type import of the same module', () => {
    const text = source('import type { Metadata } from "next";')

    expect(addImport(text, { from: 'next', names: ['Viewport'], isTypeOnly: true })).toBe(
      source('import type { Metadata, Viewport } from "next";'),
    )
  })

  it('adds a type import as its own declaration next to a value import', () => {
    const text = source('import { redirect } from "next/navigation";')

    expect(
      addImport(text, {
        from: 'next',
        names: ['NextConfig'],
        isTypeOnly: true,
      }),
    ).toBe(
      source(
        'import { redirect } from "next/navigation";',
        'import type { NextConfig } from "next";',
      ),
    )
  })

  it('skips a type import of a name the module imports as a value', () => {
    const text = source('import { Viewport } from "next";')

    expect(addImport(text, { from: 'next', names: ['Viewport'], isTypeOnly: true })).toBe(text)
  })

  it('skips a type import of a name imported inline as a type', () => {
    const text = source('import { type Viewport, redirect } from "next";')

    expect(addImport(text, { from: 'next', names: ['Viewport'], isTypeOnly: true })).toBe(text)
  })

  it('turns an inline type import into a value import when the value is needed', () => {
    const text = source('import { type A, b } from "x";')

    expect(addImport(text, { from: 'x', names: ['A'] })).toBe(source('import { A, b } from "x";'))
  })

  it('turns a type import into a value import and keeps its other names types', () => {
    const text = source('import type { Metadata, Viewport } from "next";')

    expect(addImport(text, { from: 'next', names: ['Viewport', 'cookies'] })).toBe(
      source('import { type Metadata, Viewport, cookies } from "next";'),
    )
  })

  it('turns a type-only default import into a value import', () => {
    const text = source('import type pino from "pino";')

    expect(addImport(text, { from: 'pino', defaultName: 'pino' })).toBe(
      source('import pino from "pino";'),
    )
  })

  it('adds a name that is imported only under another name', () => {
    const text = source('import { a as b } from "x";')

    expect(addImport(text, { from: 'x', names: ['a'] })).toBe(
      source('import { a as b, a } from "x";'),
    )
  })

  it('refuses a name bound to another export of the module already', () => {
    const module = openTypescriptModule('app/page.tsx', source('import { x as a } from "x";'))

    expect(() => module.addImport({ from: 'x', names: ['a'] })).toThrow(
      'app/page.tsx: a is imported from "x" as another export already',
    )
  })

  it('puts the first import after a "use client" directive', () => {
    const text = source('"use client";', '', 'export const Button = () => null;')

    expect(addImport(text, { from: 'react', names: ['useState'] })).toBe(
      source(
        '"use client";',
        '',
        'import { useState } from "react";',
        '',
        'export const Button = () => null;',
      ),
    )
  })

  it('puts the first import above the doc comment of the first statement', () => {
    const text = source('/** The logger. */', 'export const logger = pino();')

    expect(addImport(text, { from: 'pino', defaultName: 'pino' })).toBe(
      source('import pino from "pino";', '', '/** The logger. */', 'export const logger = pino();'),
    )
  })

  it('keeps a comment after the last import on its line', () => {
    const text = source(
      'import type { NextConfig } from "next"; // types only',
      '',
      'const nextConfig: NextConfig = {};',
    )

    expect(addImport(text, { from: '@next/mdx', defaultName: 'createMdx' })).toBe(
      source(
        'import type { NextConfig } from "next"; // types only',
        'import createMdx from "@next/mdx";',
        '',
        'const nextConfig: NextConfig = {};',
      ),
    )
  })

  it('copies single quotes and missing semicolons from the first import', () => {
    const text = source("import { a } from 'a'", '', 'a()')

    expect(addImport(text, { from: '@/env', names: ['env'] })).toBe(
      source("import { a } from 'a'", "import { env } from '@/env'", '', 'a()'),
    )
  })

  it('copies the style of a directive when the file has no import', () => {
    const text = source("'use client'", '', 'export const a = 1')

    expect(addImport(text, { from: 'react', names: ['useId'] })).toBe(
      source("'use client'", '', "import { useId } from 'react'", '', 'export const a = 1'),
    )
  })

  it('adds an import to an empty file', () => {
    expect(addImport('', { from: 'x', names: ['a'] })).toBe(source('import { a } from "x";'))
  })
})
