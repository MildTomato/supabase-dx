/**
 * Tape template functions
 *
 * Each function returns the full .tape file content for a given command.
 * All tapes Source the shared config.tape and Output to the docs GIF directory.
 *
 * Setup (cd into recordings directory) is injected by the generator,
 * not by individual templates.
 */

import { TAPE_CONFIG } from "./tape-config.js";

const CONFIG_SOURCE = "Source config.tape";

function outputLines(name: string): string[] {
  const base = name.replace(/\.\w+$/, "");
  return [
    `Output ../../../../apps/docs/public/demos/${base}.webm`,
    `Output ../../../../apps/docs/public/demos/${base}.mp4`,
  ];
}

function requireLine(): string {
  return "Require supa";
}

function setupBlock(setup?: string[]): string[] {
  if (!setup || setup.length === 0) return [];
  const lines = ["", "Hide"];
  for (const cmd of setup) {
    lines.push(`Type "${cmd}"`);
    lines.push("Enter");
    lines.push("Sleep 500ms");
  }
  lines.push(`Type "clear"`);
  lines.push("Enter");
  lines.push("Sleep 500ms");
  lines.push("Show");
  return lines;
}

function header(gifName: string, opts?: { height?: number; setup?: string[] }): string[] {
  const lines = [CONFIG_SOURCE, ...outputLines(gifName), "", requireLine()];
  if (opts?.height) lines.push(`Set Height ${opts.height}`);
  lines.push(...setupBlock(opts?.setup));
  return lines;
}

/**
 * Example tape — types a command, runs it, pauses for output.
 */
export function exampleTape(
  gifName: string,
  example: string,
  opts?: { height?: number; setup?: string[] }
): string {
  const lines = header(gifName, opts);
  lines.push(
    "",
    `Type@${TAPE_CONFIG.typingSpeed} "${example}"`,
    "Sleep 400ms",
    "Enter",
    `Sleep ${TAPE_CONFIG.examplePause}`,
  );
  return lines.join("\n") + "\n";
}

/**
 * Long-running tape — starts the command, waits, then Ctrl+C.
 */
export function longRunningTape(
  commandPath: string,
  gifName: string,
  opts?: { height?: number; setup?: string[] }
): string {
  const lines = header(gifName, opts);
  lines.push(
    "",
    `Type@${TAPE_CONFIG.typingSpeed} "supa ${commandPath}"`,
    "Sleep 400ms",
    "Enter",
    "Sleep 3s",
    "Ctrl+C",
    "Sleep 1s",
  );
  return lines.join("\n") + "\n";
}

/**
 * Interactive tape — wraps a hand-crafted fixture body with Source + Output.
 * The fixture provides the full tape body including typed commands.
 */
export function interactiveTape(
  gifName: string,
  tapeBody: string,
  opts?: { height?: number }
): string {
  const lines = header(gifName, opts);
  lines.push("", tapeBody);
  return lines.join("\n") + "\n";
}
