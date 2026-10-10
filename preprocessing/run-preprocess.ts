#!/usr/bin/env node
/**
 * Cross-platform launcher for preprocessing/preprocess.py.
 *
 *   1. Verifies that conda is available.
 *   2. Ensures the conda environment declared in environment.yml exists and
 *      matches it, creating or updating it as needed.
 *   3. Runs preprocess.py inside that environment, forwarding any extra CLI
 *      arguments (e.g. `--skip-existing`).
 *
 * Works on Linux, macOS, and Windows. Run via `pnpm preprocess`. Node runs this
 * TypeScript directly (native type stripping), so there is no build step.
 */

import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, "environment.yml");
const SCRIPT = join(HERE, "preprocess.py");

const isWindows = process.platform === "win32";

function fail(message: string): never {
  console.error(`\u2717 ${message}`);
  process.exit(1);
}

// conda is a shell script on POSIX and a .bat on Windows, so it always goes
// through the shell. Quote every argument so paths containing spaces survive.
function quote(arg: string): string {
  return isWindows
    ? `"${arg.replace(/"/g, '""')}"`
    : `'${arg.replace(/'/g, "'\\''")}'`;
}

function conda(
  args: string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<string> {
  const command = ["conda", ...args.map(quote)].join(" ");
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    ...options,
    shell: true,
    encoding: "utf8",
  };
  return spawnSync(command, spawnOptions);
}

interface EnvironmentYml {
  name: string | null;
  dependencies: string[];
}

/** Read the env name and the list of dependency specs from environment.yml. */
export function parseEnvironmentYml(text: string): EnvironmentYml {
  let name: string | null = null;
  const dependencies: string[] = [];
  let inDependencies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "");
    if (!line.trim()) continue;
    const content = line.trim();
    if (/^\s/.test(line)) {
      if (inDependencies && content.startsWith("- ")) {
        dependencies.push(content.slice(2).trim());
      }
      continue;
    }
    inDependencies = /^dependencies:\s*$/.test(content);
    const match = content.match(/^name:\s*(.+?)\s*$/);
    if (match) name = match[1];
  }
  return { name, dependencies };
}

/** True when `installed` (a version string) matches a conda `=version` spec. */
export function versionMatches(installed: string, spec: string): boolean {
  const have = installed.split(".");
  const want = spec.split(".");
  return (
    want.length <= have.length && want.every((part, i) => part === have[i])
  );
}

/** True when a `name` / `name=version` spec is satisfied by the installed map. */
export function specSatisfied(
  spec: string,
  installed: Map<string, string>,
): boolean {
  const eq = spec.indexOf("=");
  const name = (eq === -1 ? spec : spec.slice(0, eq)).trim().toLowerCase();
  const version = eq === -1 ? null : spec.slice(eq + 1).trim();
  const found = installed.get(name);
  if (found === undefined) return false;
  return version === null || versionMatches(found, version);
}

/** Path of the env with the given name, or null if it does not exist. */
function findEnvPrefix(envName: string): string | null {
  const result = conda(["env", "list", "--json"]);
  if (result.status !== 0) fail("Could not list conda environments.");
  let envs: string[];
  try {
    envs = (JSON.parse(result.stdout) as { envs?: string[] }).envs ?? [];
  } catch {
    fail("Could not parse `conda env list --json` output.");
  }
  return envs.find((path) => basename(path) === envName) ?? null;
}

/** Map of installed package name -> version for the given env. */
function installedPackages(envName: string): Map<string, string> {
  const result = conda(["list", "--json", "-n", envName]);
  if (result.status !== 0) return new Map();
  let packages: { name: string; version: string }[];
  try {
    packages = JSON.parse(result.stdout) as { name: string; version: string }[];
  } catch {
    return new Map();
  }
  return new Map(packages.map((pkg) => [pkg.name.toLowerCase(), pkg.version]));
}

function main(): void {
  // 1. Is conda available?
  const version = conda(["--version"]);
  if (version.error || version.status !== 0) {
    fail(
      "conda was not found on PATH. Install Miniconda/Anaconda " +
        "(https://docs.conda.io) and try again.",
    );
  }
  console.log(`\u2713 ${version.stdout.trim()}`);

  // 2. Does the environment exist and match environment.yml?
  const { name: envName, dependencies } = parseEnvironmentYml(
    readFileSync(ENV_FILE, "utf8"),
  );
  if (!envName) fail(`Could not read the environment name from ${ENV_FILE}`);

  if (!findEnvPrefix(envName)) {
    console.log(
      `\u00b7 conda env "${envName}" not found \u2014 creating it from ${basename(ENV_FILE)}`,
    );
    const created = conda(["env", "create", "-f", ENV_FILE], {
      stdio: "inherit",
    });
    if (created.status !== 0) fail(`Failed to create conda env "${envName}".`);
  } else {
    const installed = installedPackages(envName);
    const missing = dependencies.filter(
      (spec) => !specSatisfied(spec, installed),
    );
    if (missing.length > 0) {
      console.log(
        `\u00b7 conda env "${envName}" is out of date (missing: ${missing.join(", ")}) \u2014 updating`,
      );
      const updated = conda(
        ["env", "update", "-n", envName, "-f", ENV_FILE, "--prune"],
        { stdio: "inherit" },
      );
      if (updated.status !== 0)
        fail(`Failed to update conda env "${envName}".`);
    } else {
      console.log(`\u2713 conda env "${envName}" is up to date`);
    }
  }

  // 3. Run preprocess.py inside the environment, forwarding any extra CLI
  // arguments (e.g. `--skip-existing`) from the npm script.
  console.log(`\u00b7 running ${basename(SCRIPT)} in conda env "${envName}"`);
  const result = conda(
    [
      "run",
      "-n",
      envName,
      "--no-capture-output",
      "python",
      SCRIPT,
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );
  if (result.error)
    fail(`Failed to run ${basename(SCRIPT)}: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
