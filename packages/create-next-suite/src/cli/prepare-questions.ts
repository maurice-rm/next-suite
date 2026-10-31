import {
  detectPackageManager,
  findUsablePackageManager,
} from '../package-manager/detect-package-manager.ts'
import { preferPackageManager } from '../package-manager/prefer-package-manager.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { BASE_SETTINGS } from '../questions/base-settings.ts'
import { buildQuestions } from '../questions/build-questions.ts'
import { RUN_SETTINGS } from '../questions/run-settings.ts'

/**
 * The questions a run can ask: those of the plugins, the base settings and the settings of the
 * run. The package manager that started the run becomes the default.
 */
export const prepareQuestions = (plugins: readonly Plugin[], userAgent: string | undefined) => {
  const detectedPackageManager = findUsablePackageManager(plugins, detectPackageManager(userAgent))
  const questions = buildQuestions({
    categories: preferPackageManager(CATEGORIES, detectedPackageManager),
    plugins,
    settings: BASE_SETTINGS,
    runSettings: RUN_SETTINGS,
  })
  return { questions, detectedPackageManager }
}
