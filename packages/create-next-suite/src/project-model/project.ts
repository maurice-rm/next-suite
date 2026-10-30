import { openRootLayout, type RootLayout } from '../code-edit/root-layout.ts'
import { openTypescriptModule, type TypescriptModule } from '../code-edit/typescript-module.ts'
import { findPathCollision } from '../file-system/find-path-collision.ts'
import { findUnsafePathProblem } from '../file-system/find-unsafe-path-problem.ts'
import { createEnvironment, type Environment } from './environment.ts'
import { createInstrumentation, type Instrumentation } from './instrumentation.ts'
import { type LineList, openLineList } from './line-list.ts'
import { createNextConfig, type NextConfig } from './next-config.ts'
import { openPackageJson, type PackageJson } from './package-json.ts'
import { ProjectError } from './project-error.ts'
import { createProvenance, type Provenance } from './provenance.ts'
import { openReadme, type Readme } from './readme.ts'
import { isScriptPath, rewriteSourceAlias, toDiskPath } from './source-path.ts'
import { openStylesheet, type Stylesheet } from './stylesheet.ts'
import { openTsconfig, type Tsconfig } from './tsconfig.ts'

/** The files the core owns a model of, by project path; `@/` stands for the source root. */
export const PROJECT_FILES = {
  packageJson: 'package.json',
  tsconfig: 'tsconfig.json',
  gitignore: '.gitignore',
  envExample: '.env.example',
  readme: 'README.md',
  stylesheet: '@/app/globals.css',
  layout: '@/app/layout.tsx',
  nextConfig: 'next.config.ts',
  instrumentation: '@/instrumentation.ts',
  instrumentationClient: '@/instrumentation-client.ts',
} as const

const BASE_OWNER = 'base'
/** The owner of a file the core writes without a base file, such as `instrumentation.ts`. */
export const CORE_OWNER = 'core'

type ProjectSettings = {
  /** The import alias, such as `@/*` or `~/*`; imports of `@/…` go through it when printed. */
  alias: string
  /** Whether `@/` paths lie under `src/`. */
  isSrcDirectory: boolean
}

type ProjectInput = {
  /** The base project's files by project path. */
  files: ReadonlyMap<string, string>
  settings: ProjectSettings
}

/**
 * The project being assembled, in memory: its files, one owner per file, the models the core
 * keeps of its shared files and the modules opened for code edits. Paths are project paths, where
 * `@/` stands for the source root.
 */
export type Project = {
  packageJson: () => PackageJson
  tsconfig: () => Tsconfig
  gitignore: () => LineList
  stylesheet: () => Stylesheet
  readme: () => Readme
  layout: () => RootLayout
  nextConfig: () => NextConfig
  environment: Environment
  instrumentation: Instrumentation
  provenance: Provenance
  /**
   * The module of a TypeScript or JavaScript file, parsed once; every later edit works on the
   * same text.
   *
   * @throws ProjectError when the project has no such file or it is no module.
   */
  module: (path: string) => TypescriptModule
  /**
   * Adds a file owned by `owner`.
   *
   * @throws ProjectError when the path could leave the project or is taken on disk, naming both
   * owners.
   */
  write: (path: string, content: string, owner: string) => void
  ownerOf: (path: string) => string | undefined
  /** Where a project path lies on disk, such as `src/db/schema` for `@/db/schema`. */
  diskPath: (path: string) => string
  /**
   * Every file by its path on disk, sorted, with the models and modules printed into it.
   *
   * @throws ProjectError when two paths are one file on a case-insensitive system, or a file lies
   * where another needs a directory.
   */
  print: () => Map<string, string>
}

const byPath = ([left]: [string, string], [right]: [string, string]): number =>
  left < right ? -1 : 1

/** Opens a project over the base project's files; each counts as written by `base`. */
export const createProject = ({ files: baseFiles, settings }: ProjectInput): Project => {
  const diskPath = (path: string): string => toDiskPath(path, settings.isSrcDirectory)
  const files = new Map<string, string>()
  const owners = new Map<string, string>()
  const modules = new Map<string, TypescriptModule>()
  const printers = new Map<string, () => string | undefined>()
  const provenance = createProvenance()
  const environment = createEnvironment()
  const instrumentation = createInstrumentation()
  let rootLayout: RootLayout | undefined

  for (const [path, content] of baseFiles) {
    files.set(diskPath(path), content)
    owners.set(diskPath(path), BASE_OWNER)
    provenance.record({
      path: diskPath(path),
      plugin: BASE_OWNER,
      operation: 'base',
      kind: 'own',
    })
  }

  const textOf = (path: string): string => {
    const text = files.get(diskPath(path))
    if (text === undefined) {
      throw new ProjectError(`The project has no ${diskPath(path)}`)
    }
    return text
  }

  /** A model of a file, opened on first use and printed into the file from then on. */
  const lazyModel = <Model>(
    path: string,
    open: (text: string) => Model,
    print: (model: Model) => string,
  ): (() => Model) => {
    let model: Model | undefined
    return () => {
      if (model === undefined) {
        const opened = open(textOf(path))
        model = opened
        printers.set(diskPath(path), () => print(opened))
      }
      return model
    }
  }

  const module = (path: string): TypescriptModule => {
    const disk = diskPath(path)
    const opened = modules.get(disk)
    if (opened !== undefined) {
      return opened
    }
    if (!isScriptPath(disk)) {
      throw new ProjectError(`${disk} is no TypeScript or JavaScript module`)
    }
    const text = textOf(path)
    if (disk === diskPath(PROJECT_FILES.layout)) {
      rootLayout = openRootLayout(disk, text)
      modules.set(disk, rootLayout)
      return rootLayout
    }
    const created = openTypescriptModule(disk, text)
    modules.set(disk, created)
    return created
  }

  const packageJson = lazyModel(PROJECT_FILES.packageJson, openPackageJson, (model) =>
    model.print(),
  )

  const gitignore = (() => {
    let list: LineList | undefined
    return (): LineList => {
      if (list === undefined) {
        const path = diskPath(PROJECT_FILES.gitignore)
        const opened = openLineList(files.get(path) ?? '')
        list = opened
        printers.set(path, () => {
          const printed = opened.print()
          return printed === '' && !files.has(path) ? undefined : printed
        })
      }
      return list
    }
  })()

  /** The file `content` goes to; a file another owner wrote is a clash. */
  const coreFile = (path: string, content: string | undefined): [string, string][] => {
    const disk = diskPath(path)
    if (content === undefined) {
      return []
    }
    const owner = owners.get(disk)
    if (owner !== undefined && owner !== CORE_OWNER) {
      throw new ProjectError(`${owner} and ${CORE_OWNER} both write ${disk}`)
    }
    return [[disk, content]]
  }

  const printEnvExample = (): [string, string][] => {
    const disk = diskPath(PROJECT_FILES.envExample)
    const base = files.get(disk)
    if (base === undefined && environment.variables().length === 0) {
      return []
    }
    return [[disk, environment.renderExample(base ?? '')]]
  }

  return {
    packageJson,
    tsconfig: lazyModel(PROJECT_FILES.tsconfig, openTsconfig, (model) => model.print()),
    gitignore,
    stylesheet: lazyModel(PROJECT_FILES.stylesheet, openStylesheet, (model) => model.print()),
    readme: lazyModel(PROJECT_FILES.readme, openReadme, (model) =>
      model.print(files.has(diskPath(PROJECT_FILES.packageJson)) ? packageJson().scripts() : {}),
    ),
    layout: () => {
      module(PROJECT_FILES.layout)
      if (rootLayout === undefined) {
        throw new ProjectError(`${diskPath(PROJECT_FILES.layout)} is no root layout`)
      }
      return rootLayout
    },
    nextConfig: () => createNextConfig(module(PROJECT_FILES.nextConfig)),
    environment,
    instrumentation,
    provenance,
    module,

    write: (path, content, owner) => {
      const disk = diskPath(path)
      const problem = findUnsafePathProblem(disk)
      if (problem !== undefined) {
        throw new ProjectError(`${owner} writes to "${path}", which ${problem}`)
      }
      const existing = owners.get(disk)
      if (existing !== undefined) {
        throw new ProjectError(`${existing} and ${owner} both write ${disk}`)
      }
      files.set(disk, content)
      owners.set(disk, owner)
    },

    ownerOf: (path) => owners.get(diskPath(path)),
    diskPath,

    print: () => {
      const printed = new Map(files)
      for (const [path, print] of printers) {
        const content = print()
        if (content !== undefined) {
          printed.set(path, content)
        }
      }
      for (const [path, opened] of modules) {
        printed.set(path, opened.print())
      }
      for (const [path, content] of [
        ...printEnvExample(),
        ...coreFile(PROJECT_FILES.instrumentation, instrumentation.renderServer()),
        ...coreFile(PROJECT_FILES.instrumentationClient, instrumentation.renderClient()),
      ]) {
        printed.set(path, content)
        owners.set(path, owners.get(path) ?? CORE_OWNER)
      }
      const collision = findPathCollision(
        [...printed.keys()].map((path) => ({ path, origin: owners.get(path) ?? CORE_OWNER })),
      )
      if (collision !== undefined) {
        throw new ProjectError(collision)
      }
      return new Map(
        [...printed]
          .map(([path, content]): [string, string] => [
            path,
            rewriteSourceAlias(path, content, settings.alias),
          ])
          .sort(byPath),
      )
    },
  }
}
