/**
 * Pull environment variables from remote to local .env file
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { setupEnvCommand } from "../../setup.js";
import { createClient } from "@/lib/api.js";
import { writeEnvFile } from "@/lib/env-file.js";
import { listRemoteVariables } from "@/lib/env-api-bridge.js";

export interface PullOptions {
  environment?: string;
  yes?: boolean;
  json?: boolean;
  profile?: string;
}

export async function pullCommand(options: PullOptions): Promise<void> {
  const environment = options.environment || "development";

  const ctx = await setupEnvCommand({
    command: "supa project env pull",
    description: "Pull remote environment variables to .env file.",
    json: options.json,
    profile: options.profile,
    context: [["Env", environment]],
  });
  if (!ctx) return;

  const client = createClient(ctx.token);
  const spinner = options.json ? null : p.spinner();
  spinner?.start("Fetching remote variables...");

  let variables;
  try {
    variables = await listRemoteVariables(client, ctx.projectRef);
  } catch (error) {
    spinner?.stop(chalk.red("Failed to fetch variables"));
    const msg = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.error(JSON.stringify({ status: "error", message: msg }));
    } else {
      p.log.error(msg);
    }
    process.exit(1);
    return;
  }

  // Split into non-secret (writable) and secret (excluded)
  const nonSecret = variables.filter((v) => !v.secret);
  const secrets = variables.filter((v) => v.secret);

  spinner?.stop(`Found ${variables.length} variable(s) (${secrets.length} secret)`);

  if (variables.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({
        status: "success",
        message: "No variables to pull",
        variables: [],
      }));
    } else {
      p.log.info("No variables to pull");
    }
    return;
  }

  // Build header with excluded secret keys listed
  let header = `# Pulled from ${environment}`;
  if (secrets.length > 0) {
    header += `\n# Secrets excluded (${secrets.length}): ${secrets.map((s) => s.key).join(", ")}`;
  }

  // Write to supabase/.env (only non-secret variables)
  writeEnvFile(ctx.cwd, nonSecret, header);

  if (options.json) {
    console.log(JSON.stringify({
      status: "success",
      environment,
      written: nonSecret.length,
      secretsExcluded: secrets.map((s) => s.key),
      file: "supabase/.env",
    }));
  } else {
    p.log.success(
      `Wrote ${nonSecret.length} variable(s) to supabase/.env`
    );
    if (secrets.length > 0) {
      p.log.info(
        `${secrets.length} secret(s) excluded: ${chalk.dim(secrets.map((s) => s.key).join(", "))}`
      );
      p.log.info(
        `Add secrets to ${chalk.cyan("supabase/.env.local")} if needed locally`
      );
    }
  }
}
