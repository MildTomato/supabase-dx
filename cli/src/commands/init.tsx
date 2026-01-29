/**
 * Init command - initialize a new supabase project
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Spinner, Status } from '../components/Spinner.js';
import { 
  OrgPicker, 
  ProjectPicker, 
  RegionPicker, 
  CreateOrSelectChoice,
  NameInput
} from '../components/Pickers.js';
import { createClient, type Organization, type Project } from '../lib/api.js';
import { getAccessToken } from '../lib/config.js';
import { type Region } from '../lib/constants.js';
import { 
  createProject as createProjectOp, 
  createOrganization as createOrgOp
} from '../lib/operations.js';
import { success, bold, url, dim, icons } from '../lib/styles.js';
import { Output, BlankLine } from '../components/Print.js';
import { buildApiConfigFromRemote, buildAuthConfigFromRemote } from '../lib/sync.js';

interface InitOptions {
  yes?: boolean;
  json?: boolean;
}

interface ConfigData {
  projectId: string;
  api?: ReturnType<typeof buildApiConfigFromRemote>;
  auth?: ReturnType<typeof buildAuthConfigFromRemote>;
}

function buildConfigJson(data: ConfigData): string {
  const config: Record<string, unknown> = {
    $schema: '../../../cli/config-schema/config.schema.json',
    project_id: data.projectId,
  };
  
  if (data.api && Object.keys(data.api).length > 0) {
    config.api = data.api;
  }
  
  if (data.auth && Object.keys(data.auth).length > 0) {
    config.auth = data.auth;
  }
  
  config.profiles = {
    local: {
      mode: 'local',
      workflow: 'dashboard',
      branches: ['feature/*', 'fix/*', 'dev'],
    },
    production: {
      mode: 'remote',
      workflow: 'git',
      branches: ['main', 'master'],
    },
  };
  
  return JSON.stringify(config, null, 2);
}

type Step = 
  | 'loading'
  | 'org-choice'
  | 'org-select'
  | 'org-name'
  | 'org-creating'
  | 'project-choice'
  | 'project-select'
  | 'project-name'
  | 'project-region'
  | 'project-creating';

interface ProjectResult {
  ref: string;
  name: string;
}

function InitUI({ onComplete }: { onComplete: (result: ProjectResult) => void }) {
  const [step, setStep] = useState<Step>('loading');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [orgName, setOrgName] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Get step description for header
  function getStepInfo(): { title: string; subtitle?: string } {
    const orgContext = selectedOrg ? `Organization: ${selectedOrg.name}` : undefined;
    
    switch (step) {
      case 'loading':
        return { title: 'Initialize Supabase Project' };
      case 'org-choice':
      case 'org-select':
        return { 
          title: 'Step 1/2: Choose Organization',
          subtitle: 'Projects belong to organizations. Select or create one.'
        };
      case 'org-name':
        return { 
          title: 'Step 1/2: Create Organization - Name',
          subtitle: 'Organizations group your projects together.'
        };
      case 'org-creating':
        return { 
          title: 'Step 1/2: Creating Organization',
          subtitle: orgName ? `Name: ${orgName}` : undefined
        };
      case 'project-choice':
      case 'project-select':
        return { 
          title: 'Step 2/2: Choose Project',
          subtitle: orgContext
        };
      case 'project-name':
        return { 
          title: 'Step 2/2: Create Project - Name',
          subtitle: orgContext
        };
      case 'project-region':
        return { 
          title: 'Step 2/2: Create Project - Region',
          subtitle: projectName ? `Project: ${projectName}` : orgContext
        };
      case 'project-creating':
        return { 
          title: 'Step 2/2: Creating Project',
          subtitle: projectName ? `${projectName} in ${selectedOrg?.name}` : undefined
        };
      default:
        return { title: 'Initialize Supabase Project' };
    }
  }

  useEffect(() => {
    loadOrgs();
  }, []);

  async function loadOrgs() {
    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      return;
    }

    try {
      const client = createClient(token);
      const organizations = await client.listOrganizations();
      setOrgs(organizations);
      setStep('org-choice');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    }
  }

  async function loadProjects(org: Organization) {
    const token = getAccessToken();
    if (!token) return;

    try {
      const client = createClient(token);
      const allProjects = await client.listProjects();
      const orgProjects = allProjects.filter(p => p.organization_slug === org.slug);
      setProjects(orgProjects);
      setStep('project-choice');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  }

  async function createOrg(name: string) {
    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      return;
    }

    try {
      const newOrg = await createOrgOp({ token, name });
      setOrgs((prev) => [...prev, newOrg]);
      setSelectedOrg(newOrg);
      setProjects([]);
      setStep('project-choice');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create organization';
      setError(msg);
    }
  }

  async function createProject(region: Region) {
    setStep('project-creating');
    const token = getAccessToken();
    if (!token || !selectedOrg) {
      setError('Missing token or organization');
      return;
    }

    try {
      const project = await createProjectOp({
        token,
        orgSlug: selectedOrg.slug,
        region,
        name: projectName || undefined,
      });
      
      onComplete({ ref: project.ref, name: projectName });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  }

  const { title, subtitle } = getStepInfo();

  // Wrap content with header and consistent padding
  function withHeader(content: React.ReactNode) {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Text dimColor>Initializing Supabase in this directory</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">{title}</Text>
          {subtitle && <Text dimColor>{subtitle}</Text>}
          <Box marginTop={1}>{content}</Box>
        </Box>
      </Box>
    );
  }

  if (error) {
    return withHeader(<Status type="error" message={error} />);
  }

  if (step === 'loading') {
    return withHeader(<Spinner message="Connecting to Supabase..." />);
  }

  if (step === 'org-choice') {
    return withHeader(
      <CreateOrSelectChoice
        entityName="organization"
        existingCount={orgs.length}
        existingNames={orgs.map(o => o.name)}
        onChoice={(choice) => {
          if (choice === 'new') {
            setStep('org-name');
          } else {
            setStep('org-select');
          }
        }}
      />
    );
  }

  if (step === 'org-select') {
    return withHeader(
      <OrgPicker
        onSelect={(org) => {
          setSelectedOrg(org);
          loadProjects(org);
        }}
        onError={setError}
      />
    );
  }

  if (step === 'org-name') {
    const suggestedName = `my-org-${Date.now().toString(36).slice(-4)}`;
    return withHeader(
      <NameInput
        label="What would you like to name your organization?"
        placeholder={suggestedName}
        defaultValue={suggestedName}
        hint="Organizations group related projects together"
        onSubmit={(name) => {
          setOrgName(name);
          setStep('org-creating');
          createOrg(name).catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to create organization');
          });
        }}
      />
    );
  }

  if (step === 'org-creating') {
    return withHeader(<Spinner message={`Creating organization "${orgName}"...`} />);
  }

  if (step === 'project-choice') {
    return withHeader(
      <CreateOrSelectChoice
        entityName="project"
        existingCount={projects.length}
        existingNames={projects.map(p => p.name)}
        onChoice={(choice) => {
          if (choice === 'new') {
            setStep('project-name');
          } else {
            setStep('project-select');
          }
        }}
      />
    );
  }

  if (step === 'project-select') {
    return withHeader(
      <ProjectPicker
        orgSlug={selectedOrg?.slug}
        onSelect={(project) => onComplete({ ref: project.ref, name: project.name })}
        onError={setError}
      />
    );
  }

  if (step === 'project-name') {
    const suggestedName = `my-project-${Date.now().toString(36).slice(-4)}`;
    return withHeader(
      <NameInput
        label="What would you like to name your project?"
        placeholder={suggestedName}
        defaultValue={suggestedName}
        hint="This will be visible in your Supabase dashboard"
        onSubmit={(name) => {
          setProjectName(name);
          setStep('project-region');
        }}
      />
    );
  }

  if (step === 'project-region') {
    return withHeader(
      <RegionPicker
        title="Where should your project be hosted?"
        onSelect={createProject}
      />
    );
  }

  if (step === 'project-creating') {
    return withHeader(
      <Spinner message={`Creating project "${projectName}" (this may take a minute)...`} />
    );
  }

  return null;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const supabaseDir = join(cwd, 'supabase');

  if (existsSync(join(supabaseDir, 'config.json'))) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: 'Already initialized' }));
    } else {
      console.log();
      console.log('Already initialized. supabase/config.json exists.');
      console.log();
    }
    return;
  }

  const token = getAccessToken();
  if (!token) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: 'Not authenticated' }));
    } else {
      console.log('Not authenticated. Set SUPABASE_ACCESS_TOKEN environment variable.');
    }
    return;
  }

  const project = await new Promise<ProjectResult>((resolve) => {
    const { unmount, clear } = render(
      <InitUI onComplete={(result) => { clear(); unmount(); resolve(result); }} />
    );
  });

  const { ref: projectRef, name: projectName } = project;
  
  // Show spinner while fetching project config
  const ConfigSpinner = () => (
    <Box flexDirection="column" paddingTop={1}>
      <Text dimColor>Initializing Supabase in this directory</Text>
      <Box marginTop={1}>
        <Spinner message="Fetching project config..." />
      </Box>
    </Box>
  );
  
  const configSpinner = render(<ConfigSpinner />);
  
  // Fetch project config and API keys
  const client = createClient(token);
  let anonKey = '';
  let apiUrl = `https://${projectRef}.supabase.co`;
  let apiConfig: ReturnType<typeof buildApiConfigFromRemote> = {};
  let authConfig: ReturnType<typeof buildAuthConfigFromRemote> = {};
  
  try {
    // Wait a moment for the project to be ready
    await new Promise(r => setTimeout(r, 2000));
    
    // Fetch API keys
    const keys = await client.getProjectApiKeys(projectRef);
    const anonKeyObj = keys.find(k => k.name === 'anon' || k.name === 'publishable anon key');
    if (anonKeyObj?.api_key) {
      anonKey = anonKeyObj.api_key;
    }
    
    // Fetch remote config
    const remotePostgrest = await client.getPostgrestConfig(projectRef);
    apiConfig = buildApiConfigFromRemote(remotePostgrest as Record<string, unknown>);
    
    const remoteAuth = await client.getAuthConfig(projectRef);
    authConfig = buildAuthConfigFromRemote(remoteAuth as Record<string, unknown>);
  } catch {
    // Config might not be available yet if project is still initializing
  }
  
  configSpinner.clear();
  configSpinner.unmount();

  // Create directories
  const dirs = [supabaseDir, join(supabaseDir, 'migrations'), join(supabaseDir, 'functions'), join(supabaseDir, 'types')];
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  // Build config from actual project settings
  const configContent = buildConfigJson({
    projectId: projectRef,
    api: apiConfig,
    auth: authConfig,
  });
  writeFileSync(join(supabaseDir, 'config.json'), configContent);
  writeFileSync(join(supabaseDir, 'migrations', '.gitkeep'), '');
  writeFileSync(join(supabaseDir, 'functions', '.gitkeep'), '');

  if (options.json) {
    console.log(JSON.stringify({ 
      status: 'success', 
      projectId: projectRef,
      apiUrl,
      anonKey: anonKey || null,
      dashboardUrl: `https://supabase.com/dashboard/project/${projectRef}`,
      created: ['supabase/config.json', 'supabase/migrations/', 'supabase/functions/', 'supabase/types/'] 
    }));
  } else {
    const dashboardUrl = `https://supabase.com/dashboard/project/${projectRef}`;
    
    const SuccessOutput = () => (
      <Output>
        <Text>{success('Initialized Supabase')}</Text>
        <Text>  Created a new project: {bold(`"${projectName}"`)}</Text>
        <BlankLine />
        <Text dimColor>  Project</Text>
        <Text>    <Text dimColor>ID:</Text>        {projectRef}</Text>
        <Text>    <Text dimColor>Dashboard:</Text> {url(dashboardUrl)}</Text>
        <BlankLine />
        <Text dimColor>  API Credentials</Text>
        <Text>    <Text dimColor>URL:</Text>        {url(apiUrl)}</Text>
        <Text>    <Text dimColor>Anon Key:</Text>   {anonKey || <Text dimColor>[Keys still initializing]</Text>}</Text>
        <Text>    <Text dimColor>Secret Key:</Text> <Text dimColor>[hidden] run "supa keys"</Text></Text>
        <BlankLine />
        <Text dimColor>  Usage</Text>
        <Text>    <Text dimColor>createClient(</Text>{url(`"${apiUrl}"`)}<Text dimColor>, {"\"<ANON_KEY>\""}</Text><Text dimColor>)</Text></Text>
        <BlankLine />
        <Text>  <Text dimColor>Created in</Text> {bold('./supabase/')}</Text>
        <Text>    <Text dimColor>{icons.file}</Text> config.json</Text>
        <Text>    <Text dimColor>{icons.folder}</Text> migrations/</Text>
        <Text>    <Text dimColor>{icons.folder}</Text> functions/</Text>
        <Text>    <Text dimColor>{icons.folder}</Text> types/</Text>
        <BlankLine />
        <Text dimColor>  Next steps</Text>
        <Text>    <Text dimColor>$</Text> supa pull   <Text dimColor>Pull types from remote</Text></Text>
        <Text>    <Text dimColor>$</Text> supa watch  <Text dimColor>Watch for changes</Text></Text>
      </Output>
    );
    
    render(<SuccessOutput />);
  }
}
