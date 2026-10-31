import { isDeepStrictEqual } from 'node:util'

import { PointError } from './point-error.ts'

/** A service of Docker Compose that runs beside the app, such as a database. */
export type ComposeService = {
  /** The image, such as `postgres:18-alpine`. */
  readonly image: string
  /** Environment variables of the service by name. */
  readonly environment?: Readonly<Record<string, string>>
  /** Published ports, such as `5432:5432`. */
  readonly ports?: readonly string[]
  /** Mounted volumes, such as `./data:/var/lib/postgresql`. */
  readonly volumes?: readonly string[]
}

/**
 * What the app's container needs, as the users of the point `container` contribute it; the
 * selected container plugin provides it and writes it into its image build and Compose file.
 */
export type Container = {
  /**
   * Hands a variable to `next build` inside the image as a build argument, for a value inlined at
   * build time, such as `NEXT_PUBLIC_SITE_URL`.
   */
  buildArg: (name: string) => void
  /**
   * Sets an environment variable of the app's container, such as the URL of a database service.
   *
   * @throws PointError when the variable has another value already.
   */
  env: (name: string, value: string) => void
  /**
   * Runs a service beside the app; the app starts after it.
   *
   * @throws PointError when another service was added under that name.
   */
  service: (name: string, service: ComposeService) => void
  /** The build arguments in the order they were first given. */
  buildArgs: () => readonly string[]
  /** The environment variables of the app's container by name, in the order they were added. */
  environment: () => ReadonlyMap<string, string>
  /** The services by name, in the order they were added. */
  services: () => ReadonlyMap<string, ComposeService>
}

/**
 * Creates the collector of the point `container`, for the container plugin that provides it.
 * What is given twice the same way is kept once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'docker',
 *   title: 'Docker',
 *   collects: {
 *     container: {
 *       create: createContainer,
 *       finish: (container, { write }) =>
 *         write('compose.yaml', renderCompose(container.services(), container.environment())),
 *     },
 *   },
 * })
 * ```
 */
export const createContainer = (): Container => {
  const buildArgs = new Set<string>()
  const environment = new Map<string, string>()
  const services = new Map<string, ComposeService>()
  return {
    buildArg: (name) => {
      buildArgs.add(name)
    },
    env: (name, value) => {
      const present = environment.get(name)
      if (present !== undefined && present !== value) {
        throw new PointError(`the container sets ${name} to "${present}" already`)
      }
      environment.set(name, value)
    },
    service: (name, service) => {
      const present = services.get(name)
      if (present !== undefined && !isDeepStrictEqual(present, service)) {
        throw new PointError(`the container runs a service "${name}" already`)
      }
      services.set(name, service)
    },
    buildArgs: () => [...buildArgs],
    environment: () => new Map(environment),
    services: () => new Map(services),
  }
}
