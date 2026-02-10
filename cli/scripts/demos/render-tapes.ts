#!/usr/bin/env tsx
/**
 * Render VHS tape files into videos
 *
 * Finds all .tape files in generated/ and runs `vhs` on each one.
 * Init tape runs first (creates the demo project), then the rest run in parallel.
 *
 * Usage:
 *   pnpm demos:render                       # Render all tapes
 *   pnpm demos:render -- --filter init      # Render only matching tapes
 *   pnpm demos:render -- --dry-run          # Print what would render
 *   pnpm demos:render -- --concurrency 4    # Max parallel renders (default: 4)
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";

const GENERATED_DIR = join(import.meta.dirname, "generated");

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filterIdx = args.indexOf("--filter");
const filter = filterIdx >= 0 ? args[filterIdx + 1] : null;
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 4;

// Find all .tape files (excluding config.tape)
const tapeFiles = readdirSync(GENERATED_DIR)
  .filter((f) => f.endsWith(".tape") && f !== "config.tape")
  .filter((f) => !filter || f.includes(filter))
  .sort();

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

function renderTape(file: string): Promise<{ file: string; ok: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", `PATH="${CLI_BIN}:$PATH" vhs ${file}`], {
      cwd: GENERATED_DIR,
      stdio: "pipe",
      timeout: 180_000,
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`  ✓ ${file}`);
        resolve({ file, ok: true });
      } else {
        console.error(`  ✗ ${file} (exit ${code})`);
        resolve({ file, ok: false });
      }
    });

    child.on("error", (err) => {
      console.error(`  ✗ ${file} (${err.message})`);
      resolve({ file, ok: false });
    });
  });
}

async function renderBatch(files: string[], max: number): Promise<number> {
  let failed = 0;
  // Process in chunks of `max`
  for (let i = 0; i < files.length; i += max) {
    const batch = files.slice(i, i + max);
    console.log(`\nBatch ${Math.floor(i / max) + 1}: rendering ${batch.length} tape(s)...`);
    const results = await Promise.all(batch.map(renderTape));
    failed += results.filter((r) => !r.ok).length;
  }
  return failed;
}

// ── Main ──────────────────────────────────────────────────────

const initTape = "supa-init.tape";
const hasInit = tapeFiles.includes(initTape);
const restTapes = tapeFiles.filter((f) => f !== initTape);

let failed = 0;

// Init must run first — it creates the project other tapes depend on
if (hasInit) {
  console.log("Phase 1: Rendering init tape (creates demo project)...");
  const result = await renderTape(initTape);
  if (!result.ok) {
    console.error("Init tape failed — aborting (other tapes depend on it).");
    process.exit(1);
  }
}

// Render the rest in parallel
if (restTapes.length > 0) {
  console.log(`\nPhase 2: Rendering ${restTapes.length} tape(s) in parallel (concurrency: ${concurrency})...`);
  failed = await renderBatch(restTapes, concurrency);
}

const total = tapeFiles.length;
console.log("");
console.log(`Rendered ${total - failed}/${total} tapes.`);

if (failed > 0) {
  console.error(`${failed} tape(s) failed.`);
  process.exit(1);
}
