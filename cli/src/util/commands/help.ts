/**
 * Help rendering — shared data extraction with chalk and JSON formatters.
 *
 * JSON output follows the agents-help-machine-readable standard from CLI Guidelines.
 */

import chalk from "chalk";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globalCommandOptions } from "./arg-common.js";
import type { Command, CommandOption } from "./types.js";
import { loadProjectConfig, getProfileOrAuto, getProjectRef } from "@/lib/config.js";
import { getCurrentBranch } from "@/lib/git.js";

const CLI_NAME = "supa";

function getCliVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, "../package.json"), "utf-8"));
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

// ─────────────────────────────────────────────────────────────
// Shared help data
// ─────────────────────────────────────────────────────────────

interface HelpOption {
  flag: string;
  shorthand?: string;
  type: string | string[];
  required: boolean;
  description: string;
  argument?: string;
}

interface HelpArgument {
  name: string;
  required: boolean;
  multiple?: true;
  description?: string;
}

interface HelpExample {
  name: string;
  value: string | ReadonlyArray<string>;
}

interface HelpContext {
  projectRef?: string;
  branch: string;
  profileName?: string;
}

interface HelpData {
  name: string;
  isRoot: boolean;
  version: string;
  description: string;
  usage: string;
  aliases: string[];
  /** null = no project configured, undefined = context not requested */
  context: HelpContext | null | undefined;
  arguments: HelpArgument[];
  commands: ReadonlyArray<Command>;
  options: HelpOption[];
  examples: HelpExample[];
  footer?: string;
}

function buildUsage(command: Command, parent?: Command, isRoot?: boolean): string {
  const parts: string[] = [CLI_NAME];

  if (parent) {
    parts.push(parent.name);
  }

  if (!isRoot) {
    parts.push(command.name);
  }

  const args = [...command.arguments];

  if (args.length === 0 && command.subcommands && command.subcommands.length > 0) {
    const hasDefault = command.subcommands.some((sub) => sub.default);
    args.push({
      name: "command",
      required: isRoot ? false : !hasDefault,
    });
  }

  for (const arg of args) {
    let name = arg.name;
    if (arg.multiple) {
      name += "...";
    }
    parts.push(arg.required ? `<${name}>` : `[${name}]`);
  }

  if (command.options.length > 0) {
    parts.push("[options]");
  }

  return parts.join(" ");
}

function getContext(): HelpContext | null {
  const cwd = process.cwd();
  const config = loadProjectConfig(cwd);

  if (!config) {
    return null;
  }

  const branch = getCurrentBranch(cwd) || "unknown";
  const profile = getProfileOrAuto(config, undefined, branch);
  const projectRef = getProjectRef(config, profile);

  return {
    projectRef,
    branch,
    profileName: profile?.name,
  };
}

function optionToHelp(opt: CommandOption): HelpOption {
  return {
    flag: `--${opt.name}`,
    ...(opt.shorthand ? { shorthand: `-${opt.shorthand}` } : {}),
    type: Array.isArray(opt.type)
      ? opt.type.map((t) => t.name.toLowerCase())
      : opt.type.name.toLowerCase(),
    required: false,
    description: opt.description || "",
    ...(opt.argument ? { argument: opt.argument } : {}),
  };
}

function buildHelpData(command: Command, options: RenderHelpOptions = {}): HelpData {
  const allOptions = [...command.options, ...globalCommandOptions];

  return {
    name: command.name,
    isRoot: options.isRoot ?? false,
    version: getCliVersion(),
    description: command.description,
    usage: buildUsage(command, options.parent, options.isRoot),
    aliases: [...command.aliases],
    context: options.showContext !== false ? getContext() : undefined,
    arguments: command.arguments.map((a) => ({
      name: a.name,
      required: a.required,
      ...(a.multiple ? { multiple: true as const } : {}),
      ...(a.description ? { description: a.description } : {}),
    })),
    commands: (command.subcommands ?? []).filter((cmd) => !cmd.hidden),
    options: allOptions
      .filter((opt) => !opt.deprecated && opt.description !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(optionToHelp),
    examples: command.examples.map((ex) => ({
      name: ex.name,
      value: ex.value,
    })),
    footer: options.footer,
  };
}

// ─────────────────────────────────────────────────────────────
// JSON formatter (agents-help-machine-readable standard)
// ─────────────────────────────────────────────────────────────

function commandToJson(cmd: Command) {
  const visibleOpts = [...cmd.options, ...globalCommandOptions].filter(
    (opt) => !opt.deprecated && opt.description !== undefined
  );

  return {
    name: cmd.name,
    description: cmd.description,
    ...(cmd.aliases.length > 0 ? { aliases: [...cmd.aliases] } : {}),
    ...(cmd.arguments.length > 0
      ? {
          arguments: cmd.arguments.map((a) => ({
            name: a.name,
            required: a.required,
          })),
        }
      : {}),
    ...(visibleOpts.length > 0
      ? { options: visibleOpts.map(optionToHelp) }
      : {}),
  };
}

function formatHelpJson(data: HelpData) {
  const result: Record<string, unknown> = {};

  // Root uses "name" + "version", subcommands use "command"
  if (data.isRoot) {
    result.name = data.name;
    result.version = data.version;
  } else {
    result.command = data.name;
  }

  result.description = data.description;
  result.usage = data.usage;

  if (data.aliases.length > 0) {
    result.aliases = data.aliases;
  }

  if (data.context !== undefined) {
    if (data.context) {
      result.context = {
        ...(data.context.projectRef ? { project: data.context.projectRef } : {}),
        branch: data.context.branch,
        ...(data.context.profileName ? { profile: data.context.profileName } : {}),
      };
    } else {
      result.context = null;
    }
  }

  if (data.arguments.length > 0) {
    result.arguments = data.arguments;
  }

  if (data.commands.length > 0) {
    result.commands = data.commands.map(commandToJson);
  }

  if (data.options.length > 0) {
    result.options = data.options;
  }

  if (data.examples.length > 0) {
    result.examples = data.examples;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Chalk formatter (human-readable)
// ─────────────────────────────────────────────────────────────

function formatHelpText(data: HelpData): string {
  const lines: string[] = [];

  lines.push("");

  // Context
  if (data.context === null) {
    lines.push(chalk.dim("No project configured. Run `supa init` to get started."));
    lines.push("");
  } else if (data.context) {
    if (data.context.projectRef) {
      lines.push(`${chalk.dim("Project:")}    ${chalk.cyan(data.context.projectRef)}`);
    }
    lines.push(`${chalk.dim("Git Branch:")} ${chalk.yellow(data.context.branch)}`);
    if (data.context.profileName) {
      lines.push(`${chalk.dim("Profile:")}    ${chalk.cyan(data.context.profileName)}`);
    }
    lines.push("");
  }

  // Usage
  lines.push(`${chalk.bold("Usage:")} ${data.usage}`);
  lines.push("");

  // Description
  lines.push(data.description);
  lines.push("");

  // Commands
  if (data.commands.length > 0) {
    lines.push(chalk.bold("Commands:"));
    const maxLen = Math.max(...data.commands.map((c) => c.name.length));
    for (const cmd of data.commands) {
      const padding = " ".repeat(maxLen - cmd.name.length + 2);
      lines.push(`  ${chalk.cyan(cmd.name)}${padding}${chalk.dim(cmd.description)}`);
    }
    lines.push("");
  }

  // Options
  if (data.options.length > 0) {
    lines.push(chalk.bold("Options:"));
    const maxLen = Math.max(
      ...data.options.map((o) => {
        const flags = [o.shorthand, o.flag].filter(Boolean).join(", ");
        return flags.length + (o.argument ? o.argument.length + 3 : 0);
      })
    );
    for (const opt of data.options) {
      const flags = [opt.shorthand, opt.flag].filter(Boolean).join(", ");
      const label = flags + (opt.argument ? ` <${opt.argument}>` : "");
      const padding = " ".repeat(maxLen - label.length + 2);
      lines.push(`  ${chalk.green(label)}${padding}${chalk.dim(opt.description)}`);
    }
    lines.push("");
  }

  // Examples
  if (data.examples.length > 0) {
    lines.push(chalk.bold("Examples:"));
    for (const ex of data.examples) {
      const values = Array.isArray(ex.value) ? ex.value : [ex.value];
      for (const value of values) {
        lines.push(`  ${chalk.dim(`${ex.name}: ${value}`)}`);
      }
    }
    lines.push("");
  }

  // Footer
  if (data.footer) {
    lines.push(chalk.dim(data.footer));
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export interface RenderHelpOptions {
  parent?: Command;
  isRoot?: boolean;
  showContext?: boolean;
  footer?: string;
  json?: boolean;
}

/**
 * Render help for a command (chalk for humans, JSON when --json is set)
 */
export function renderHelp(command: Command, options: RenderHelpOptions = {}): void {
  const data = buildHelpData(command, options);
  const useJson = options.json ?? process.argv.includes("--json");
  if (useJson) {
    console.log(JSON.stringify(formatHelpJson(data), null, 2));
    return;
  }
  console.log(formatHelpText(data));
}

/**
 * Generate help text as string
 */
export function help(command: Command, options: RenderHelpOptions = {}): string {
  return formatHelpText(buildHelpData(command, options));
}
