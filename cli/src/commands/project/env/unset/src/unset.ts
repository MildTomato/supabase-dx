/**
 * Delete an environment variable
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { setupEnvCommand } from "../../setup.js";
import { createClient } from "@/lib/api.js";
import { loadLocalEnvVars, writeEnvFile } from "@/lib/env-file.js";
import { deleteRemoteVariable } from "@/lib/env-api-bridge.js";

export interface UnsetOptions {
  key: string;
  environment?: string;
  branch?: string;
  yes?: boolean;
  json?: boolean;
  profile?: string;
}

export async function unsetCommand(options: UnsetOptions): Promise<void> {
  const environment = options.environment || "development";
  const target = options.branch
    ? `${environment} (branch: ${options.branch})`
    : environment;

  const ctx = await setupEnvCommand({
    command: "supa project env unset",
    description: "Delete an environment variable.",
    json: options.json,
    profile: options.profile,
    context: [
      ["Env", target],
      ["Key", options.key],
    ],
  });
  if (!ctx) return;

  // Confirm unless --yes
  if (!options.yes && process.stdout.isTTY && !options.json) {
    const proceed = await p.confirm({
      message: `Delete ${options.key} from ${environment}?`,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.cancel("Cancelled");
      return;
    }
  }

  if (environment === "development") {
    // Remove from supabase/.env
    const existing = loadLocalEnvVars(ctx.cwd);
    const filtered = existing.variables.filter((v) => v.key !== options.key);

    if (filtered.length === existing.variables.length) {
      if (options.json) {
        console.log(JSON.stringify({
          status: "success",
          message: "Variable not found",
          key: options.key,
        }));
      } else {
        p.log.warn(`${options.key} not found in supabase/.env`);
      }
      return;
    }

    writeEnvFile(ctx.cwd, filtered, existing.header);

    if (options.json) {
      console.log(JSON.stringify({
        status: "success",
        key: options.key,
        environment: "development",
      }));
    } else {
      p.log.success(`Removed ${chalk.cyan(options.key)} from supabase/.env`);
    }
  } else {
    // Delete from remote
    const client = createClient(ctx.token);
    const spinner = options.json ? null : p.spinner();
    spinner?.start(`Deleting ${options.key}...`);

    try {
      await deleteRemoteVariable(client, ctx.projectRef, options.key);
      spinner?.stop(`Deleted ${chalk.cyan(options.key)} from ${environment}`);

      if (options.json) {
        console.log(JSON.stringify({
          status: "success",
          key: options.key,
          environment,
        }));
      }
    } catch (error) {
      spinner?.stop(chalk.red("Failed"));
      const msg = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.error(JSON.stringify({ status: "error", message: msg }));
      } else {
        p.log.error(`Failed to delete variable: ${msg}`);
      }
      process.exit(1);
    }
  }
}
