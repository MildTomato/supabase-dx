#!/usr/bin/env tsx
/**
 * Render VHS tape files into GIFs
 *
 * Finds all .tape files in generated/ and runs `vhs` on each one sequentially.
 *
 * Usage:
 *   pnpm demos:render                    # Render all tapes
 *   pnpm demos:render -- --filter init   # Render only matching tapes
 *   pnpm demos:render -- --dry-run       # Print what would render
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const GENERATED_DIR = join(import.meta.dirname, "generated");

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filterIdx = args.indexOf("--filter");
const filter = filterIdx >= 0 ? args[filterIdx + 1] : null;

// Find all .tape files (excluding config.tape), init first
const tapeFiles = readdirSync(GENERATED_DIR)
  .filter((f) => f.endsWith(".tape") && f !== "config.tape")
  .filter((f) => !filter || f.includes(filter))
  .sort((a, b) => {
    // init must run first — it creates the project other tapes depend on
    if (a === "supa-init.tape") return -1;
    if (b === "supa-init.tape") return 1;
    return a.localeCompare(b);
  });

if (tapeFiles.length === 0) {
  console.log("No tape files found.");
  if (filter) console.log(`  (filter: "${filter}")`);
  process.exit(0);
}

console.log(`Found ${tapeFiles.length} tape file(s) to render:`);
for (const f of tapeFiles) {
  console.log(`  ${f}`);
}
console.log("");

if (dryRun) {
  console.log("Dry run — no files rendered.");
  process.exit(0);
}

// Check that vhs is available
try {
  execSync("which vhs", { stdio: "ignore" });
} catch {
  console.error("Error: vhs is not installed or not in PATH.");
  console.error("Install it: https://github.com/charmbracelet/vhs");
  process.exit(1);
}

// Add cli/bin to PATH so `supa` command is available for VHS
const CLI_BIN = join(import.meta.dirname, "..", "..", "bin");
const PATH_WITH_CLI = `${CLI_BIN}:${process.env.PATH}`;

let failed = 0;

for (const file of tapeFiles) {
  const tapePath = join(GENERATED_DIR, file);
  console.log(`Rendering ${file}...`);

  try {
    execSync(`PATH="${CLI_BIN}:$PATH" vhs ${file}`, {
      cwd: GENERATED_DIR,
      stdio: "inherit",
      timeout: 120_000,
    });
    console.log(`  Done.`);
  } catch (err) {
    console.error(`  FAILED: ${file}`);
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
    }
    failed++;
  }
}

console.log("");
console.log(`Rendered ${tapeFiles.length - failed}/${tapeFiles.length} tapes.`);

if (failed > 0) {
  console.error(`${failed} tape(s) failed.`);
  process.exit(1);
}
