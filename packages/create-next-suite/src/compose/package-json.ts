import type { VersionCatalog } from '../contract/version-catalog.ts'
import type { CompositionValues } from './merge-contributions.ts'
import { packageManagerFields, type SelectedPackageManager } from './package-manager-fields.ts'

export const PACKAGE_FILE = 'package.json'

type PackageJsonInput = {
  projectName: string
  values: CompositionValues
  packageManager: SelectedPackageManager | undefined
  catalog: VersionCatalog
}

/**
 * The content of package.json: the name, the plugins' fields, the package manager, the scripts and
 * the dependencies, then the fields of the package manager.
 */
export const createPackageJson = ({
  projectName,
  values,
  packageManager,
  catalog,
}: PackageJsonInput): string => {
  const managerFields =
    packageManager === undefined
      ? undefined
      : packageManagerFields({
          ...packageManager,
          builds: { allowed: values.allowedBuilds, denied: values.deniedBuilds },
          catalog,
        })
  const packageJson = {
    name: projectName,
    ...values.fields,
    packageManager: managerFields?.packageManager,
    scripts: values.scripts,
    dependencies: values.dependencies,
    devDependencies: values.devDependencies,
    ...managerFields?.fields,
  }
  return `${JSON.stringify(packageJson, null, 2)}\n`
}
