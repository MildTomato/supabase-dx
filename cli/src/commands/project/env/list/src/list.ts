/**
 * List environment variables for an environment
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { setupEnvCommand } from "../../setup.js";
import { createClient } from "@/lib/api.js";
import { loadLocalEnvVars } from "@/lib/env-file.js";
import { listRemoteVariables } from "@/lib/env-api-bridge.js";

export interface ListOptions {
  environment?: string;
  branch?: string;
  json?: boolean;
  profile?: string;
}

export async function listCommand(options: ListOptions): Promise<void> {
  const environment = options.environment || "development";
  const target = options.branch
    ? `${environment} (branch: ${options.branch})`
    : environment;

  const ctx = await setupEnvCommand({
    command: "supa project env list",
    description: "List environment variables.",
    json: options.json,
    profile: options.profile,
    context: [["Env", target]],
  });
  if (!ctx) return;

  if (environment === "development") {
    // Show supabase/.env contents
    const parsed = loadLocalEnvVars(ctx.cwd);

    if (options.json) {
      console.log(JSON.stringify({
        status: "success",
        environment: "development",
        variables: parsed.variables.map((v) => ({
          key: v.key,
          value: v.secret ? "[secret]" : v.value,
          secret: v.secret,
        })),
      }));
      return;
    }

    if (parsed.variables.length === 0) {
      p.log.info("No variables in supabase/.env");
      return;
    }

    console.log();
    const maxKeyLen = Math.max(...parsed.variables.map((v) => v.key.length));
    for (const v of parsed.variables) {
      const key = v.key.padEnd(maxKeyLen);
      const value = v.secret ? chalk.dim("[secret]") : v.value;
      console.log(`  ${chalk.cyan(key)}  ${value}`);
    }
    console.log();
    console.log(chalk.dim(`  ${parsed.variables.length} variable(s) in supabase/.env`));
  } else {
    // List from remote
    const client = createClient(ctx.token);
    const spinner = options.json ? null : p.spinner();
    spinner?.start("Fetching variables...");

    try {
      const variables = await listRemoteVariables(client, ctx.projectRef);
      spinner?.stop(`Found ${variables.length} variable(s)`);

      if (options.json) {
        console.log(JSON.stringify({
          status: "success",
          environment,
          variables: variables.map((v) => ({
            key: v.key,
            value: v.secret ? "[secret]" : v.value,
            secret: v.secret,
          })),
        }));
        return;
      }

      if (variables.length === 0) {
        p.log.info(`No variables in ${environment}`);
        return;
      }

      console.log();
      const maxKeyLen = Math.max(...variables.map((v) => v.key.length));
      for (const v of variables) {
        const key = v.key.padEnd(maxKeyLen);
        const value = v.secret ? chalk.dim("[secret]") : v.value;
        console.log(`  ${chalk.cyan(key)}  ${value}`);
      }
      console.log();
      console.log(chalk.dim(`  ${variables.length} variable(s) in ${environment}`));
    } catch (error) {
      spinner?.stop(chalk.red("Failed"));
      const msg = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.error(JSON.stringify({ status: "error", message: msg }));
      } else {
        p.log.error(`Failed to list variables: ${msg}`);
      }
      process.exit(1);
    }
  }
}
