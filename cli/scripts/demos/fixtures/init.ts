/**
 * Hand-crafted interactive tape for `supa init`
 *
 * Demo path: supa init → existing org → new project
 * Based on clack prompts in InitWizard.tsx
 */

import type { TapeFixture } from "./index.js";

const randomSuffix = Math.random().toString(36).slice(2, 6);

export const initFixture: TapeFixture = {
  category: "INTERACTIVE",
  height: 800,
  tapeBody: `# Setup: create demo directory (hidden from recording)
Hide
Type "rm -rf ../../../demos/recordings && mkdir -p ../../../demos/recordings && cd ../../../demos/recordings && rm -rf ./supabase ./.env"
Enter
Sleep 1s
Type "clear"
Enter
Sleep 500ms
Show

# Start init wizard
Type@50ms "supa init"
Enter
# Waits for: header, config check spinner, orgs fetch spinner
Sleep 8s

# Organization prompt: "Use existing"
Enter
Sleep 2s

# Select organization: browse a few, then search
Sleep 500ms
Down
Sleep 600ms
Down
Sleep 600ms
Down
Sleep 600ms
Up
Sleep 600ms
Up
Sleep 600ms
Type@80ms "Docmrk"
Sleep 1s
Enter
# Waits for: projects fetch spinner
Sleep 6s

# Project prompt: "Create new"
Down
Sleep 300ms
Enter
Sleep 2s

# Project name
Type@80ms "${randomSuffix}-delete-me"
Sleep 500ms
Enter
Sleep 2s

# Region: search and select
Type@80ms "us-east"
Sleep 1s
Enter
Sleep 2s

# Schema management: accept default (Declarative)
Enter
Sleep 1s

# Config source: accept default (In code)
Enter
Sleep 2s

# Workflow profile: browse through options
Sleep 500ms
Down
Sleep 800ms
Down
Sleep 800ms
Up
Sleep 800ms
Up
Sleep 600ms
Enter
Sleep 5s`,
};
