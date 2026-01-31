# Supabase Workflow Profiles - DX Spike

## Overview

Exploring different "workflow profiles" that users can select in their config to match how they work. The profile determines:

- How many environments they work with
- What `supa dev` and `supa push` do
- The overall ceremony level

---

## Workflow Profiles

### 1. `solo` - "Just ship it"

```
   [Local] ──────supa push──────► [PRODUCTION]

   One environment. Zero ceremony. Just ship.
```

| Aspect       | Behavior                                 |
| ------------ | ---------------------------------------- |
| Environments | 1 (prod)                                 |
| `supa dev`   | Watches files, shows what _would_ change |
| `supa push`  | Applies changes to prod                  |
| Ceremony     | Minimal                                  |

**Vibe**: Side project, indie hacker, moving fast

**Config example:**

```json
{
  "workflow_profile": "solo",
  "project_id": "abc123"
}
```

---

### 2. `staged` - "Safety net"

```
   [Local] ──supa push──► [STAGING] ──supa merge──► [PRODUCTION]

   Test in staging, then merge to prod. Peace of mind.
```

| Aspect       | Behavior                       |
| ------------ | ------------------------------ |
| Environments | 2 (staging + prod)             |
| `supa dev`   | Syncs to staging automatically |
| `supa push`  | Applies changes to staging     |
| `supa merge` | Merges staging → prod          |
| Ceremony     | Medium                         |

**Vibe**: "I want to test before prod but I'm still mostly solo"

**Config example:**

```json
{
  "workflow_profile": "staged",
  "environments": {
    "staging": { "project_id": "abc123" },
    "production": { "project_id": "xyz789" }
  }
}
```

---

### 3. `preview` - "Multiple preview environments"

```
   [Local] ──► [preview-alice] ─┐
   [Local] ──► [preview-bob]   ─┤
   [Local] ──► [preview-carol] ─┴─► [PRODUCTION]

   Manually create and push to named preview environments.
```

| Aspect       | Behavior                                                 |
| ------------ | -------------------------------------------------------- |
| Environments | N (manually named preview environments)                  |
| `supa dev`   | Syncs to selected preview env                            |
| `supa push`  | Applies to selected preview env                          |
| `supa merge` | Merge any preview → prod (e.g. `merge alice production`) |
| Ceremony     | Medium (manual environment management)                   |

**Vibe**: Multiple developers, each with their own sandbox

**Config example:**

```json
{
  "workflow_profile": "preview",
  "environments": {
    "preview-alice": { "project_id": "abc123" },
    "preview-bob": { "project_id": "def456" },
    "production": { "project_id": "xyz789" }
  }
}
```

---

### 4. `preview-git` - "Git-driven preview environments"

```
   [feature/auth] ──► [preview-auth] ─┐
   [feature/pay]  ──► [preview-pay]  ─┤ (auto-created
   [feature/dash] ──► [preview-dash] ─┤  from branches)
                                       │
                        merge PR ──────┴─► [PRODUCTION]

   GitHub creates/destroys preview envs based on branches.
```

| Aspect       | Behavior                                                          |
| ------------ | ----------------------------------------------------------------- |
| Environments | N (auto-created from Git branches)                                |
| `supa dev`   | Syncs to preview env for current branch                           |
| `supa push`  | Applies to preview env                                            |
| Merge PR     | Triggers prod deploy (via CI/GitHub Actions)                      |
| `supa merge` | Manual merge between envs (e.g. `merge preview-auth preview-pay`) |
| Ceremony     | Higher (requires GitHub integration)                              |

**Vibe**: Team workflow, CI/CD, ephemeral preview environments

**Config example:**

```json
{
  "workflow_profile": "preview-git",
  "environments": {
    "production": {
      "project_id": "xyz789",
      "branches": ["main", "master"]
    }
  },
  "preview": {
    "auto_create": true,
    "naming": "preview-{branch}",
    "github": {
      "enabled": true,
      "destroy_on_close": true
    }
  }
}
```

---

## Open Questions

1. **For `solo` profile**: Should `supa dev` actually sync changes live, or just watch and preview (dry-run mode)?

2. **Profile selection UX**:
   - Interactive prompt during `supa init` with ASCII art for each profile?
   - Manual config edit?
   - Both?

3. **Migration between profiles**: What happens if someone starts with `solo` and wants to move to `staged`? How do we guide them through adding environments?

4. **Default profile**: Which should be the default for new projects? Probably `solo` for simplicity.

5. **Naming**: Is "workflow_profile" the right field name? Alternatives:
   - `workflow`
   - `mode`
   - `dev_workflow`
   - `profile`

6. **Preview environment creation**:
   - In `preview` profile: How do users create new named environments? Via CLI command or config edit?
   - In `preview-git` profile: How does GitHub integration work? Webhooks? GitHub Actions? API?

7. **Environment selection**: In `preview` profile with multiple named environments, how does the user specify which one they're targeting for `supa push`/`dev`?

---

## Key Commands

### `supa merge <source> <target>`

Merges the state from one environment to another. Always explicit about source and target.

**Examples:**

```bash
supa merge preview-auth preview-payments  # Merge one preview into another
supa merge staging production             # Merge staging to prod
supa merge preview-foo production         # Skip staging, go straight to prod
```

**Smart defaults in `staged` profile:**

```bash
supa merge  # No args = staging → production (the obvious path in staged workflow)
```

**In `preview` profile:** No args = error (must specify source and target, too many options)

---

## Command Behavior by Profile

| Command       | `solo`          | `staged`                                       | `preview`                                     | `preview-git`                                              |
| ------------- | --------------- | ---------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `supa dev`    | Watch + preview | Sync to staging                                | Sync to selected preview env                  | Sync to preview env for current branch                     |
| `supa push`   | → prod          | → staging                                      | → selected preview env                        | → preview env for current branch                           |
| `supa pull`   | prod → local    | staging → local                                | preview → local                               | preview → local                                            |
| `supa merge`  | N/A             | `staging production` (or just `merge` default) | `<source> <target>` (e.g. `alice production`) | `<source> <target>` (e.g. `preview-auth preview-payments`) |
| `supa status` | Show prod diff  | Show staging diff                              | Show preview diff                             | Show preview diff                                          |
