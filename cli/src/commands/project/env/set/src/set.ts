/**
 * Set a single environment variable
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { setupEnvCommand } from "../../setup.js";
import { createClient } from "@/lib/api.js";
import { loadLocalEnvVars, writeEnvFile, isSensitiveKey } from "@/lib/env-file.js";
import { setRemoteVariable } from "@/lib/env-api-bridge.js";
import type { EnvVariable } from "@/lib/env-types.js";

export interface SetOptions {
  key: string;
  value?: string;
  environment?: string;
  branch?: string;
  secret?: boolean;
  json?: boolean;
  profile?: string;
}

export async function setCommand(options: SetOptions): Promise<void> {
  const environment = options.environment || "development";
  const target = options.branch
    ? `${environment} (branch: ${options.branch})`
    : environment;

  const context: [string, string][] = [
    ["Env", target],
    ["Key", options.key],
  ];
  if (options.secret) {
    context.push(["Secret", chalk.yellow("yes")]);
  }

  const ctx = await setupEnvCommand({
    command: "supa project env set",
    description: "Set a single environment variable.",
    json: options.json,
    profile: options.profile,
    context,
  });
  if (!ctx) return;

  // Get the value - from arg, stdin, or prompt
  let value = options.value;
  if (value === undefined) {
    if (process.stdin.isTTY) {
      const input = await p.text({
        message: `Value for ${options.key}`,
        placeholder: "Enter value",
        validate: (v) => {
          if (!v) return "Value is required";
        },
      });
      if (p.isCancel(input)) {
        p.cancel("Cancelled");
        return;
      }
      value = String(input);
    } else {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      value = Buffer.concat(chunks).toString("utf-8").trim();
    }
  }

  // Determine if secret
  let isSecret = options.secret;
  if (isSecret === undefined && process.stdout.isTTY && !options.json) {
    const defaultSecret = isSensitiveKey(options.key);
    const markSecret = await p.confirm({
      message: "Mark as secret?",
      initialValue: defaultSecret,
    });
    if (p.isCancel(markSecret)) {
      p.cancel("Cancelled");
      return;
    }
    isSecret = markSecret;
  }
  isSecret = isSecret ?? isSensitiveKey(options.key);

  if (environment === "development") {
    // Write to supabase/.env
    const existing = loadLocalEnvVars(ctx.cwd);
    const existingMap = new Map(existing.variables.map((v) => [v.key, v]));

    existingMap.set(options.key, {
      key: options.key,
      value,
      secret: isSecret,
    });

    const variables: EnvVariable[] = Array.from(existingMap.values());
    writeEnvFile(ctx.cwd, variables, existing.header);

    if (options.json) {
      console.log(JSON.stringify({
        status: "success",
        key: options.key,
        environment: "development",
        file: "supabase/.env",
      }));
    } else {
      p.log.success(`Set ${chalk.cyan(options.key)} in supabase/.env`);
    }
  } else {
    // Push to remote
    const client = createClient(ctx.token);
    const spinner = options.json ? null : p.spinner();
    spinner?.start(`Setting ${options.key}...`);

    try {
      await setRemoteVariable(client, ctx.projectRef, options.key, value, isSecret);
      spinner?.stop(`Set ${chalk.cyan(options.key)} in ${environment}`);

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
        p.log.error(`Failed to set variable: ${msg}`);
      }
      process.exit(1);
    }
  }
}
