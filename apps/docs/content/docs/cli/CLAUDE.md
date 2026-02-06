# CLI Documentation

## Auto-generated reference docs

Files in `reference/` are **auto-generated** from CLI command specs. Do not edit
them directly.

To update CLI reference documentation:

1. Edit the command spec in `cli/src/commands/<command>/command.ts`
2. Add prose content in `cli/src/commands/<command>/docs/`:
   - `intro.md` — Introductory content at the top of the page
   - `option.<name>.md` — Extra details for a specific option
   - `example.<slug>.md` — Extra content for a specific example
3. Run `pnpm docs:generate` from the `cli/` directory

Generated files have `generated: true` in their frontmatter.

## Manually maintained docs

These files are manually maintained and safe to edit directly:

- `getting-started.mdx`
- `workflow-profiles.mdx`
- `schema-sync.mdx`
- `audit.mdx`
- `index.mdx`
