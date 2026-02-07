# Docs app

This directory contains the documentation site for the Supabase CLI, built with
Next.js and Fumadocs.

## CLI reference documentation

Files in `content/docs/cli/reference/` are **auto-generated** from CLI command
specs. Don't edit them directly.

### How to update CLI reference docs

To update CLI reference documentation:

1. Edit the command spec in `../../cli/src/commands/<command>/command.ts`
2. Add prose content in `../../cli/src/commands/<command>/docs/`:
   - `intro.md` - Introductory content at the top of the page
   - `option.<name>.md` - Extra details for a specific option
   - `example.<slug>.md` - Extra content for a specific example
3. Run `npm run docs:generate` from the `cli/` directory

Generated files have `generated: true` in their frontmatter.

### Documentation structure for nested commands

The generator follows these rules for organizing nested commands:

**Top-level subcommands (depth 1)** get their own pages:

- `supa project pull` → `project/pull.mdx`
- `supa project push` → `project/push.mdx`

**Nested subcommands (depth 2+)** are documented as sections within their parent
page:

- `supa project auth-provider list` → Section in `project/auth-provider/index.mdx`
- `supa project auth-provider add` → Section in `project/auth-provider/index.mdx`

This approach prevents documentation sprawl and makes it easier for users to
compare related operations.

### Fumadocs folder conventions

For commands with subcommands, follow these Fumadocs conventions:

- **Top-level folders** (`project/`, `projects/`) get a `meta.json` with a
  `pages` array
- **Nested folders** (`project/auth-provider/`) don't get `meta.json`
  - Use `index.mdx` as the parent page (makes the folder clickable)
  - Fumadocs auto-detects sibling `.mdx` files as children (makes the folder
    expandable)
  - This matches Fumadocs' own documentation pattern

The generator script handles this automatically:

- Creates `meta.json` only for top-level command folders
- Nested subcommand folders rely on auto-detection
- Skips file generation for depth 2+ commands (they're inlined in parent)

## Manually maintained docs

These files in `content/docs/cli/` are manually maintained:

- `getting-started.mdx`
- `workflow-profiles.mdx`
- `schema-sync.mdx`
- `audit.mdx`
- `index.mdx`

## Tech stack

- Next.js 16 with Turbopack
- Fumadocs for documentation framework
- MDX for content
