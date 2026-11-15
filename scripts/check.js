import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoots = ["src", "public", "tests", "scripts", "legacy"];
const secretPattern =
  /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["'][A-Za-z0-9+/_-]{24,}["']/i;
let failures = 0;
let checked = 0;
async function walk(relative) {
  for (const entry of await readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const file = path.join(relative, entry.name);
    if (
      entry.name.startsWith(".") ||
      entry.name === "vendor" ||
      entry.name === "node_modules"
    )
      continue;
    if (entry.isDirectory()) {
      await walk(file);
      continue;
    }
    if (!entry.isFile()) continue;
    if (path.extname(file) === ".js" && !file.startsWith("legacy" + path.sep)) {
      const result = spawnSync(
        process.execPath,
        ["--check", path.join(root, file)],
        { encoding: "utf8" },
      );
      checked++;
      if (result.status !== 0) {
        console.error(`Syntax check failed: ${file}\n${result.stderr}`);
        failures++;
      }
    }
    if ([".js", ".py", ".ipynb", ".json", ".md"].includes(path.extname(file))) {
      if (secretPattern.test(await readFile(path.join(root, file), "utf8"))) {
        console.error(`Possible hardcoded credential: ${file}`);
        failures++;
      }
    }
  }
}
for (const sourceRoot of sourceRoots) await walk(sourceRoot);
console.log(
  `Checked ${checked} JavaScript files and scanned source for hardcoded credentials.`,
);
process.exitCode = failures ? 1 : 0;
