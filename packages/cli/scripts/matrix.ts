import { SCENARIOS, scenarioToFlags } from "@/generator/__tests__/scenarios";

// Emit the GitHub Actions matrix for generated-build.yml: one entry per
// scenario with its package manager and the `create-next-suite --yes` flags
// that reproduce it. The workflow generates each through the real CLI (install
// + shadcn init + fix step run) and then builds the output.
const matrix = SCENARIOS.map((scenario) => ({
  name: scenario.name,
  pm: scenario.config.packageManager,
  flags: scenarioToFlags(scenario.config).join(" "),
}));

console.log(JSON.stringify(matrix));
