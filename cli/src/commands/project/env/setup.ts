/**
 * Shared setup for all env subcommands.
 *
 * Handles the repeated pattern:
 *   1. JSON mode → resolve context, return it for command-specific JSON output
 *   2. Interactive → requireTTY, resolve context, print header + context lines
 *
 * Returns ProjectContext for the caller to continue with business logic.
 */

import {
  resolveProjectContext,
  requireTTY,
  type ProjectContext,
} from "@/lib/resolve-project.js";
import { printCommandHeader } from "@/components/command-header.js";

export interface EnvCommandSetup {
  command: string;
  description: string;
  json?: boolean;
  profile?: string;
  context?: [label: string, value: string][];
}

/**
 * Set up an env subcommand. Handles TTY check, project resolution,
 * and prints the command header with context lines.
 *
 * Returns ProjectContext for business logic. JSON mode commands
 * handle their own output after receiving the context.
 */
export async function setupEnvCommand(
  options: EnvCommandSetup
): Promise<ProjectContext | null> {
  // JSON mode: resolve context and return it for command-specific handling
  if (options.json) {
    const ctx = await resolveProjectContext(options);
    return ctx;
  }

  requireTTY();
  const ctx = await resolveProjectContext(options);

  const context: [string, string][] = [
    ["Project", ctx.projectRef],
    ["Profile", ctx.profile?.name || "default"],
    ...(options.context || []),
  ];

  printCommandHeader({
    command: options.command,
    description: [options.description],
    context,
  });

  return ctx;
}
