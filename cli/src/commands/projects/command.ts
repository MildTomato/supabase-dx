/**
 * Projects command specification
 */

import { jsonOption, orgOption, regionOption, nameOption, yesOption, dryRunOption } from "@/util/commands/arg-common.js";
import type { Command } from "@/util/commands/types.js";

const listSubcommand = {
  name: "list",
  aliases: [],
  description: "List all projects",
  default: true,
  arguments: [],
  options: [
    { ...jsonOption },
    { ...orgOption, description: "Filter by organization ID" },
  ],
  examples: [],
} as const satisfies Command;

const deleteSubcommand = {
  name: "delete",
  aliases: ["remove", "rm"],
  description: "Delete a project",
  arguments: [],
  options: [
    {
      name: "project",
      shorthand: null,
      type: String,
      argument: "REF",
      deprecated: false,
      description: "Project reference ID",
    },
    { ...orgOption, description: "Filter by organization" },
    { ...yesOption, description: "Skip confirmation prompt" },
    { ...jsonOption },
  ],
  examples: [
    {
      name: "Interactive delete",
      value: "supa projects delete",
    },
    {
      name: "Delete by ref",
      value: "supa projects delete --project abc123xyz",
    },
    {
      name: "Skip confirmation",
      value: "supa projects delete --project abc123xyz --yes",
    },
  ],
} as const satisfies Command;

const newSubcommand = {
  name: "new",
  aliases: ["create"],
  description: "Create a new project",
  arguments: [],
  options: [
    { ...orgOption, description: "Organization ID" },
    { ...regionOption },
    { ...nameOption, description: "Project name" },
    { ...yesOption, description: "Skip confirmation prompts" },
    { ...dryRunOption, description: "Preview what would be created without making changes" },
  ],
  examples: [],
} as const satisfies Command;

export const projectsCommand = {
  name: "projects",
  aliases: [],
  description: "Manage projects",
  arguments: [],
  subcommands: [listSubcommand, newSubcommand, deleteSubcommand],
  options: [],
  examples: [
    {
      name: "List all projects",
      value: "supa projects list",
    },
    {
      name: "List projects for an org",
      value: "supa projects list --org my-org",
    },
    {
      name: "Create a new project",
      value: "supa projects new",
    },
    {
      name: "Delete a project",
      value: "supa projects delete",
    },
  ],
} as const satisfies Command;

export {
  listSubcommand as projectsListSubcommand,
  newSubcommand as projectsNewSubcommand,
  deleteSubcommand as projectsDeleteSubcommand,
};
