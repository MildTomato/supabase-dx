import React, { useState, useEffect } from 'react';
import { render, Text, Box, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Spinner, Status } from '../components/Spinner.js';
import { createClient } from '../lib/api.js';
import {
  getAccessToken,
  loadProjectConfig,
  getProfileOrAuto,
  getProjectRef,
  Profile,
} from '../lib/config.js';
import { getCurrentBranch } from '../lib/git.js';
import { 
  buildPostgrestPayload, 
  buildAuthPayload,
  compareConfigs,
  type ProjectConfig,
  type ConfigDiff,
} from '../lib/sync.js';
import { ConfigDiffSummary } from '../components/ConfigDiff.js';

interface ConfigPlanSection {
  keys: string[];
  diffs: ConfigDiff[];
}

interface PushPlan {
  migrations: string[];
  functions: string[];
  config: {
    postgrest: ConfigPlanSection;
    auth: ConfigPlanSection;
  };
}

interface PushState {
  step: 'loading' | 'planning' | 'confirm' | 'applying' | 'done' | 'error';
  profile?: Profile;
  projectRef?: string;
  plan?: PushPlan;
  projectConfig?: ProjectConfig;
  appliedCount: number;
  error?: string;
}

interface PushAppProps {
  cwd: string;
  profileName?: string;
  dryRun: boolean;
  yes: boolean;
  migrationsOnly: boolean;
  configOnly: boolean;
}

function PushApp({ cwd, profileName, dryRun, yes, migrationsOnly, configOnly }: PushAppProps) {
  const { exit } = useApp();
  const [state, setState] = useState<PushState>({ step: 'loading', appliedCount: 0 });

  useEffect(() => {
    loadPlan();
  }, []);

  async function loadPlan() {
    // Load config
    const config = loadProjectConfig(cwd);
    if (!config) {
      setState({ step: 'error', error: 'No supabase/config.json found', appliedCount: 0 });
      setTimeout(() => exit(), 100);
      return;
    }

    // Get current git branch
    const currentBranch = getCurrentBranch(cwd) || undefined;

    // Get profile
    const profile = getProfileOrAuto(config, profileName, currentBranch);
    if (!profile) {
      setState({ step: 'error', error: 'No profile configured', appliedCount: 0 });
      setTimeout(() => exit(), 100);
      return;
    }

    // Get project ref
    const projectRef = getProjectRef(config, profile);
    if (!projectRef) {
      setState({ step: 'error', error: 'No project ref configured', appliedCount: 0 });
      setTimeout(() => exit(), 100);
      return;
    }

    // Get access token
    const token = getAccessToken();
    if (!token) {
      setState({ step: 'error', error: 'Not logged in. Run: supa login', appliedCount: 0 });
      setTimeout(() => exit(), 100);
      return;
    }

    // Build plan
    setState({ step: 'planning', profile, projectRef, appliedCount: 0 });

    const client = createClient(token);
    const projectConfig = config as ProjectConfig;
    
    const plan = await buildPlan({
      cwd,
      migrationsOnly,
      configOnly,
      config: projectConfig,
      client,
      projectRef,
    });

    // Check for actual changes (not just keys, but diffs with changed: true)
    const postgrestChanges = plan.config.postgrest.diffs.filter(d => d.changed);
    const authChanges = plan.config.auth.diffs.filter(d => d.changed);
    const hasActualConfigChanges = postgrestChanges.length > 0 || authChanges.length > 0;
    const isEmpty = plan.migrations.length === 0 && plan.functions.length === 0 && !hasActualConfigChanges;
    
    if (isEmpty) {
      setState({ step: 'done', profile, projectRef, plan, projectConfig, appliedCount: 0 });
      setTimeout(() => exit(), 100);
      return;
    }

    if (dryRun || yes) {
      if (dryRun) {
        setState({ step: 'done', profile, projectRef, plan, projectConfig, appliedCount: 0 });
        setTimeout(() => exit(), 100);
      } else {
        await applyPlan(token, projectRef, plan, projectConfig);
      }
    } else {
      setState({ step: 'confirm', profile, projectRef, plan, projectConfig, appliedCount: 0 });
    }
  }

  async function applyPlan(token: string, projectRef: string, plan: PushPlan, projectConfig?: ProjectConfig) {
    setState((s) => ({ ...s, step: 'applying' }));

    const client = createClient(token);
    let appliedCount = 0;

    // Apply config changes first
    if (projectConfig) {
      const postgrestPayload = buildPostgrestPayload(projectConfig);
      if (postgrestPayload && plan.config.postgrest.keys.length > 0) {
        try {
          await client.updatePostgrestConfig(projectRef, postgrestPayload);
        } catch (error) {
          setState({
            step: 'error',
            error: `Failed to update API config: ${error instanceof Error ? error.message : 'Unknown error'}`,
            appliedCount,
          });
          setTimeout(() => exit(), 100);
          return;
        }
      }

      const authPayload = buildAuthPayload(projectConfig);
      if (authPayload && plan.config.auth.keys.length > 0) {
        try {
          await client.updateAuthConfig(projectRef, authPayload);
        } catch (error) {
          setState({
            step: 'error',
            error: `Failed to update Auth config: ${error instanceof Error ? error.message : 'Unknown error'}`,
            appliedCount,
          });
          setTimeout(() => exit(), 100);
          return;
        }
      }
    }

    // Apply migrations
    for (const migration of plan.migrations) {
      try {
        const migrationPath = join(cwd, 'supabase', 'migrations', migration);
        const content = readFileSync(migrationPath, 'utf-8');

        // Extract name from filename
        const baseName = migration.replace('.sql', '');
        const parts = baseName.split('_');
        const name = parts.slice(1).join('_');

        await client.applyMigration(projectRef, content, name);
        appliedCount++;
        setState((s) => ({ ...s, appliedCount }));
      } catch (error) {
        setState({
          step: 'error',
          error: `Failed to apply ${migration}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          appliedCount,
        });
        setTimeout(() => exit(), 100);
        return;
      }
    }

    setState((s) => ({
      ...s,
      step: 'done',
      appliedCount,
    }));
    setTimeout(() => exit(), 100);
  }

  async function handleConfirmChoice(choice: 'apply' | 'cancel') {
    if (choice === 'apply') {
      const token = getAccessToken();
      if (token && state.projectRef && state.plan) {
        await applyPlan(token, state.projectRef, state.plan, state.projectConfig);
      }
    } else {
      exit();
    }
  }

  if (state.step === 'loading') {
    return (
      <Box padding={1}>
        <Spinner message="Loading configuration..." />
      </Box>
    );
  }

  if (state.step === 'planning') {
    return (
      <Box padding={1}>
        <Spinner message="Building push plan..." />
      </Box>
    );
  }

  if (state.step === 'error') {
    return (
      <Box padding={1}>
        <Status type="error" message={state.error || 'Push failed'} />
      </Box>
    );
  }

  // Get changed diffs for display
  const postgrestDiffs = state.plan?.config.postgrest.diffs ?? [];
  const authDiffs = state.plan?.config.auth.diffs ?? [];
  const postgrestChanges = postgrestDiffs.filter(d => d.changed);
  const authChanges = authDiffs.filter(d => d.changed);
  const hasConfigChanges = postgrestChanges.length > 0 || authChanges.length > 0;
  const hasMigrations = (state.plan?.migrations.length ?? 0) > 0;

  // Shared plan details component
  const renderPlanDetails = () => (
    <>
      {state.plan && state.plan.migrations.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>Migrations:</Text>
          {state.plan.migrations.map((m) => (
            <Text key={m}>  <Text color="green">+</Text> <Text>{m}</Text></Text>
          ))}
        </Box>
      )}
      
      <ConfigDiffSummary 
        postgrestDiffs={postgrestDiffs} 
        authDiffs={authDiffs} 
        hasMigrations={hasMigrations} 
      />
    </>
  );

  if (state.step === 'confirm') {
    const confirmItems = [
      { key: 'apply', label: 'Apply changes', value: 'apply' as const },
      { key: 'cancel', label: 'Cancel', value: 'cancel' as const },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="yellow">Pending changes</Text>
        
        <Box marginTop={1} flexDirection="column">
          {renderPlanDetails()}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <SelectInput
            items={confirmItems}
            onSelect={(item) => handleConfirmChoice(item.value)}
          />
        </Box>
      </Box>
    );
  }

  if (state.step === 'applying') {
    return (
      <Box padding={1}>
        <Spinner
          message={`Applying migrations (${state.appliedCount}/${state.plan?.migrations.length || 0})...`}
        />
      </Box>
    );
  }

  // Build pending message
  const getPendingMessage = () => {
    const parts: string[] = [];
    if (hasMigrations) parts.push('DDL');
    if (hasConfigChanges) parts.push('config');
    return `Pending ${parts.join(' + ')} changes`;
  };

  const isEmpty = !state.plan || (state.plan.migrations.length === 0 && state.plan.functions.length === 0 && !hasConfigChanges);

  return (
    <Box flexDirection="column" padding={1}>
      {isEmpty ? (
        <Status type="success" message="Nothing to push - everything is up to date" />
      ) : (
        <>
          <Status 
            type={dryRun ? "info" : "success"} 
            message={dryRun 
              ? getPendingMessage()
              : `Pushed${state.appliedCount > 0 ? ` ${state.appliedCount} migrations` : ''}${hasConfigChanges ? `${state.appliedCount > 0 ? ' +' : ''} config` : ''}`
            } 
          />
          
          {dryRun && state.plan && (
            <Box marginTop={1} flexDirection="column">
              {renderPlanDetails()}
              
              <Box marginTop={1}>
                <Text dimColor>(plan mode - no changes applied)</Text>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

interface BuildPlanOptions {
  cwd: string;
  migrationsOnly: boolean;
  configOnly: boolean;
  config?: ProjectConfig;
  client?: ReturnType<typeof createClient>;
  projectRef?: string;
}

async function buildPlan(options: BuildPlanOptions): Promise<PushPlan> {
  const { cwd, migrationsOnly, configOnly, config, client, projectRef } = options;
  const plan: PushPlan = { 
    migrations: [], 
    functions: [], 
    config: { 
      postgrest: { keys: [], diffs: [] }, 
      auth: { keys: [], diffs: [] } 
    } 
  };

  // Config settings
  if (config && !migrationsOnly) {
    const postgrestPayload = buildPostgrestPayload(config);
    if (postgrestPayload) {
      plan.config.postgrest.keys = Object.keys(postgrestPayload);
      
      // Fetch remote config for diff
      if (client && projectRef) {
        const remoteConfig = await client.getPostgrestConfig(projectRef);
        plan.config.postgrest.diffs = compareConfigs(
          postgrestPayload as Record<string, unknown>,
          remoteConfig as Record<string, unknown>
        );
      }
    }
    
    const authPayload = buildAuthPayload(config);
    if (authPayload) {
      plan.config.auth.keys = Object.keys(authPayload);
      
      // Fetch remote config for diff
      if (client && projectRef) {
        const remoteConfig = await client.getAuthConfig(projectRef);
        plan.config.auth.diffs = compareConfigs(
          authPayload as Record<string, unknown>,
          remoteConfig as Record<string, unknown>
        );
      }
    }
  }

  if (configOnly) {
    return plan;
  }

  // Find migrations
  const migrationsDir = join(cwd, 'supabase', 'migrations');
  try {
    const entries = readdirSync(migrationsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && entry.name.endsWith('.sql')) {
        plan.migrations.push(entry.name);
      }
    }
    plan.migrations.sort();
  } catch {
    // No migrations directory
  }

  if (migrationsOnly) {
    return plan;
  }

  // Find functions
  const functionsDir = join(cwd, 'supabase', 'functions');
  try {
    const entries = readdirSync(functionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== '_shared'
      ) {
        plan.functions.push(entry.name);
      }
    }
    plan.functions.sort();
  } catch {
    // No functions directory
  }

  return plan;
}

interface PushOptions {
  profile?: string;
  plan?: boolean;
  yes?: boolean;
  migrationsOnly?: boolean;
  configOnly?: boolean;
  json?: boolean;
}

export async function pushCommand(options: PushOptions) {
  const cwd = process.cwd();
  const dryRun = options.plan ?? false;
  const yes = options.yes ?? false;
  const migrationsOnly = options.migrationsOnly ?? false;
  const configOnly = options.configOnly ?? false;

  if (options.json) {
    // JSON mode
    const config = loadProjectConfig(cwd);
    if (!config) {
      console.log(JSON.stringify({ status: 'error', message: 'No config found' }));
      return;
    }

    const currentBranch = getCurrentBranch(cwd) || undefined;
    const profile = getProfileOrAuto(config, options.profile, currentBranch);
    const projectRef = getProjectRef(config, profile);
    const token = getAccessToken();

    if (!token) {
      console.log(JSON.stringify({ status: 'error', message: 'Not logged in' }));
      return;
    }

    if (!projectRef) {
      console.log(JSON.stringify({ status: 'error', message: 'No project ref' }));
      return;
    }

    const client = createClient(token);
    const projectConfig = config as ProjectConfig;
    const plan = await buildPlan({
      cwd,
      migrationsOnly,
      configOnly,
      config: projectConfig,
      client,
      projectRef,
    });

    const hasConfig = plan.config.postgrest.keys.length > 0 || plan.config.auth.keys.length > 0;
    const isEmpty = plan.migrations.length === 0 && plan.functions.length === 0 && !hasConfig;

    if (isEmpty) {
      console.log(
        JSON.stringify({
          status: 'success',
          message: 'Nothing to push',
          migrationsFound: 0,
          migrationsApplied: 0,
          configChanges: 0,
        })
      );
      return;
    }

    if (dryRun) {
      console.log(
        JSON.stringify({
          status: 'success',
          message: 'Dry run',
          dryRun: true,
          migrationsFound: plan.migrations.length,
          functionsFound: plan.functions.length,
          migrations: plan.migrations,
          functions: plan.functions,
          config: plan.config,
        })
      );
      return;
    }

    let appliedCount = 0;

    // Apply config changes
    if (hasConfig) {
      const postgrestPayload = buildPostgrestPayload(projectConfig);
      if (postgrestPayload && plan.config.postgrest.keys.length > 0) {
        try {
          await client.updatePostgrestConfig(projectRef, postgrestPayload);
        } catch (error) {
          console.log(
            JSON.stringify({
              status: 'error',
              message: 'Failed to update API config',
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          );
          return;
        }
      }

      const authPayload = buildAuthPayload(projectConfig);
      if (authPayload && plan.config.auth.keys.length > 0) {
        try {
          await client.updateAuthConfig(projectRef, authPayload);
        } catch (error) {
          console.log(
            JSON.stringify({
              status: 'error',
              message: 'Failed to update Auth config',
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          );
          return;
        }
      }
    }

    // Apply migrations
    for (const migration of plan.migrations) {
      try {
        const migrationPath = join(cwd, 'supabase', 'migrations', migration);
        const content = readFileSync(migrationPath, 'utf-8');
        const baseName = migration.replace('.sql', '');
        const parts = baseName.split('_');
        const name = parts.slice(1).join('_');

        await client.applyMigration(projectRef, content, name);
        appliedCount++;
      } catch (error) {
        console.log(
          JSON.stringify({
            status: 'error',
            message: `Failed to apply ${migration}`,
            error: error instanceof Error ? error.message : 'Unknown error',
            migrationsApplied: appliedCount,
          })
        );
        return;
      }
    }

    console.log(
      JSON.stringify({
        status: 'success',
        message: `Applied ${appliedCount} migrations${hasConfig ? ' and config' : ''}`,
        migrationsFound: plan.migrations.length,
        migrationsApplied: appliedCount,
        configApplied: hasConfig,
      })
    );
    return;
  }

  render(
    <PushApp
      cwd={cwd}
      profileName={options.profile}
      dryRun={dryRun}
      yes={yes}
      migrationsOnly={migrationsOnly}
      configOnly={configOnly}
    />
  );
}
