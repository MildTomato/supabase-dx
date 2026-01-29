import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { initCommand } from './commands/init.js';
import { orgsCommand } from './commands/orgs.js';
import { projectsCommand } from './commands/projects.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { watchCommand } from './commands/watch.js';
import { devCommand } from './commands/dev.js';
import { schemaDiffCommand, schemaPullCommand, schemaStatusCommand } from './commands/schema.js';

// Load .env files silently (simple implementation to avoid dotenv noise)
function loadEnvFile(path: string) {
  try {
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Ignore errors
  }
}

loadEnvFile('.env');
loadEnvFile('supabase/.env');
loadEnvFile('.env.local');

const program = new Command();

program
  .name('supa')
  .description('Supabase DX CLI - experimental developer experience tools')
  .version('0.0.1')
  .hook('preAction', () => {
    if (!process.env.SUPABASE_ACCESS_TOKEN) {
      console.error('Error: SUPABASE_ACCESS_TOKEN environment variable is required');
      console.error('Get one at: https://supabase.com/dashboard/account/tokens');
      process.exit(1);
    }
  });

// Init command
program
  .command('init')
  .description('Initialize a new supabase project')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--json', 'Output as JSON')
  .action(initCommand);

// Organizations command
program
  .command('orgs')
  .description('List organizations')
  .option('--json', 'Output as JSON')
  .action(orgsCommand);

// Projects command group
const projects = program
  .command('projects')
  .description('Manage projects');

projects
  .command('list')
  .description('List all projects')
  .option('--json', 'Output as JSON')
  .option('--org <id>', 'Filter by organization ID')
  .action((options) => projectsCommand({ ...options, action: 'list' }));

projects
  .command('new')
  .description('Create a new project')
  .option('--org <id>', 'Organization ID')
  .option('--region <region>', 'Region (e.g., us-east-1)')
  .option('--name <name>', 'Project name')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action((options) => projectsCommand({ ...options, action: 'new' }));

// Pull command
program
  .command('pull')
  .description('Pull remote state to local (remote → local)')
  .option('-p, --profile <name>', 'Profile to use (from ./supabase/config.toml)')
  .option('--plan', 'Show what would happen without making changes')
  .option('--types-only', 'Only generate TypeScript types')
  .option('--schemas <schemas>', 'Schemas to include for type generation', 'public')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed pg-delta logging')
  .action(pullCommand);

// Push command
program
  .command('push')
  .description('Push local changes to remote (local → remote)')
  .option('-p, --profile <name>', 'Profile to use (from ./supabase/config.json)')
  .option('--plan', 'Show what would happen without making changes')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--migrations-only', 'Only apply migrations')
  .option('--config-only', 'Only apply config changes (api, auth settings)')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed pg-delta logging')
  .action(pushCommand);

// Watch command
program
  .command('watch')
  .description('Watch for changes and keep things running')
  .option('-p, --profile <name>', 'Profile to use (from ./supabase/config.toml)')
  .option('--types-interval <interval>', 'Interval for regenerating types (e.g., 30s, 1m)', '30s')
  .option('--no-branch-watch', 'Disable git branch watching')
  .option('--json', 'Output as JSON (events as newline-delimited JSON)')
  .action(watchCommand);

// Dev command - watch and sync schema changes
program
  .command('dev')
  .description('Watch for schema changes and sync to remote database')
  .option('-p, --profile <name>', 'Profile to use (from ./supabase/config.json)')
  .option('--debounce <ms>', 'Debounce interval for file changes (e.g., 500ms, 1s)', '500ms')
  .option('--types-interval <interval>', 'Interval for regenerating types (e.g., 30s, 1m)', '30s')
  .option('--no-branch-watch', 'Disable git branch watching')
  .option('--dry-run', 'Show what would be synced without applying')
  .option('-v, --verbose', 'Show detailed pg-delta logging')
  .option('--json', 'Output as JSON (events as newline-delimited JSON)')
  .action(devCommand);

// Schema command group (Atlas-based declarative schema management)
const schema = program
  .command('schema')
  .description('Declarative schema management (requires Atlas)');

schema
  .command('status')
  .description('Check Atlas availability')
  .action(schemaStatusCommand);

schema
  .command('diff')
  .description('Compare local schema with remote database')
  .option('-p, --profile <name>', 'Profile to use')
  .action(schemaDiffCommand);

schema
  .command('pull')
  .description('Pull remote database schema to local files')
  .option('-p, --profile <name>', 'Profile to use')
  .action(schemaPullCommand);

program.parse();
