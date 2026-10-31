import { definePlugin } from 'create-next-suite/plugin'
import { type ComposeService, createContainer } from 'create-next-suite/points'

const NODE_IMAGE = 'node:24-alpine'
const PORT = '3000'
const APP_SERVICE = 'app'
const INDENT = '  '
/** The Compose key that starts the app after its services. */
const DEPENDS_ON = 'depends_on'

type Yaml = string | readonly string[] | { readonly [key: string]: Yaml | undefined }

/** YAML of strings, lists and maps, each string quoted as JSON, which YAML reads too. */
const renderYaml = (value: Yaml, depth = 0): string[] => {
  const indent = INDENT.repeat(depth)
  if (typeof value === 'string') {
    return [`${indent}${JSON.stringify(value)}`]
  }
  if (Array.isArray(value)) {
    return value.map((item: string) => `${indent}- ${JSON.stringify(item)}`)
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    if (entry === undefined) {
      return []
    }
    return typeof entry === 'string'
      ? [`${indent}${key}: ${JSON.stringify(entry)}`]
      : [`${indent}${key}:`, ...renderYaml(entry, depth + 1)]
  })
}

const serviceYaml = (service: ComposeService): Yaml => ({
  image: service.image,
  environment: service.environment,
  ports: service.ports,
  volumes: service.volumes,
})

/** The app's image: install and build with the project's package manager, run the standalone server. */
const renderDockerfile = (
  { install, build }: { install: string; build: string },
  buildArgs: readonly string[],
): string =>
  [
    `FROM ${NODE_IMAGE} AS builder`,
    'WORKDIR /app',
    'RUN corepack enable',
    'COPY . .',
    `RUN ${install}`,
    ...buildArgs.flatMap((name) => [`ARG ${name}`, `ENV ${name}=$${name}`]),
    `RUN ${build}`,
    '',
    `FROM ${NODE_IMAGE} AS runner`,
    'WORKDIR /app',
    `ENV NODE_ENV=production PORT=${PORT} HOSTNAME=0.0.0.0`,
    'RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs',
    'COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./',
    'COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static',
    'USER nextjs',
    `EXPOSE ${PORT}`,
    'CMD ["node", "server.js"]',
    '',
  ].join('\n')

export default definePlugin({
  name: 'docker',
  title: 'Docker',
  description: 'Builds the app into a container image and runs it with Docker Compose.',
  nextConfig: { options: { output: JSON.stringify('standalone') } },
  files: { '.dockerignore': 'files/dockerignore' },
  readme: {
    Docker: '`docker compose up --build` builds the image and starts the app with its services.',
  },
  collects: {
    container: {
      create: createContainer,
      finish: (container, { env, packageManager, write }) => {
        const clientVariables = env
          .filter(({ scope }) => scope === 'client')
          .map(({ name }) => name)
        const buildArgs = [...new Set([...clientVariables, ...container.buildArgs()])]
        const services = container.services()
        write(
          'Dockerfile',
          renderDockerfile(
            { install: packageManager.ciInstall, build: `${packageManager.run} build` },
            buildArgs,
          ),
        )
        const app: Yaml = {
          build: { context: '.', ...(buildArgs.length === 0 ? {} : { args: buildArgs }) },
          ports: [`${PORT}:${PORT}`],
          environment:
            container.environment().size === 0
              ? undefined
              : Object.fromEntries(container.environment()),
          [DEPENDS_ON]: services.size === 0 ? undefined : [...services.keys()],
        }
        const serviceEntries = [...services].map(([name, service]) => [name, serviceYaml(service)])
        const compose = { services: { [APP_SERVICE]: app, ...Object.fromEntries(serviceEntries) } }
        write('compose.yaml', `${renderYaml(compose).join('\n')}\n`)
      },
    },
  },
})
