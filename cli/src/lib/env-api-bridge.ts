/**
 * Environment API bridge
 * Routes env commands to real APIs. Uses the secrets API as a bridge
 * for non-platform variables, and config APIs for platform variables.
 *
 * Key constraint: secrets API rejects names starting with `SUPABASE_`.
 * Platform variables (SUPABASE_AUTH_*, SUPABASE_API_*) go through their
 * respective config APIs.
 */
import type { SupabaseClient } from "./api.js";
import type { EnvVariable } from "./env-types.js";

/**
 * Check if a key is a platform variable (routed to config APIs, not secrets API)
 */
export function isPlatformVariable(key: string): boolean {
  return key.startsWith("SUPABASE_");
}

/**
 * List all remote variables from secrets API + config APIs
 */
export async function listRemoteVariables(
  client: SupabaseClient,
  projectRef: string
): Promise<EnvVariable[]> {
  const variables: EnvVariable[] = [];

  // Fetch from secrets API (non-SUPABASE_ vars)
  try {
    const secrets = await client.listSecrets(projectRef);
    for (const s of secrets) {
      variables.push({
        key: s.name,
        value: s.value ?? "",
        secret: true,
      });
    }
  } catch {
    // Secrets API might fail, continue with config APIs
  }

  // Fetch auth config for SUPABASE_AUTH_* variables
  try {
    const authConfig = await client.getAuthConfig(projectRef);
    const authRecord = authConfig as unknown as Record<string, unknown>;

    // Extract external provider values
    for (const [key, value] of Object.entries(authRecord)) {
      if (
        key.startsWith("external_") &&
        typeof value === "string" &&
        value !== ""
      ) {
        const canonicalKey = `SUPABASE_AUTH_${key.toUpperCase()}`;
        const isSecret = key.endsWith("_secret");
        variables.push({
          key: canonicalKey,
          value: isSecret ? "" : String(value),
          secret: isSecret,
        });
      }
    }
  } catch {
    // Auth config might fail, continue
  }

  return variables;
}

/**
 * Set a single remote variable
 */
export async function setRemoteVariable(
  client: SupabaseClient,
  projectRef: string,
  key: string,
  value: string,
  secret: boolean
): Promise<void> {
  if (isPlatformVariable(key)) {
    // Route through config APIs
    if (key.startsWith("SUPABASE_AUTH_")) {
      const authKey = key.replace("SUPABASE_AUTH_", "").toLowerCase();
      await client.updateAuthConfig(projectRef, {
        [authKey]: value,
      } as Record<string, unknown>);
    } else if (key.startsWith("SUPABASE_API_")) {
      const apiKey = key.replace("SUPABASE_API_", "").toLowerCase();
      await client.updatePostgrestConfig(projectRef, {
        [apiKey]: value,
      } as Record<string, unknown>);
    }
  } else {
    // Use secrets API for non-platform variables
    await client.createSecrets(projectRef, [{ name: key, value }]);
  }
}

/**
 * Delete a single remote variable
 */
export async function deleteRemoteVariable(
  client: SupabaseClient,
  projectRef: string,
  key: string
): Promise<void> {
  if (isPlatformVariable(key)) {
    // Platform variables can be unset by setting empty string
    if (key.startsWith("SUPABASE_AUTH_")) {
      const authKey = key.replace("SUPABASE_AUTH_", "").toLowerCase();
      await client.updateAuthConfig(projectRef, {
        [authKey]: "",
      } as Record<string, unknown>);
    }
  } else {
    await client.deleteSecrets(projectRef, [key]);
  }
}

/**
 * Bulk push variables to remote
 */
export async function bulkPushVariables(
  client: SupabaseClient,
  projectRef: string,
  variables: EnvVariable[],
  options: { prune?: boolean } = {}
): Promise<{ pushed: number; deleted: number }> {
  let pushed = 0;
  let deleted = 0;

  // Split into platform and non-platform variables
  const platformVars = variables.filter((v) => isPlatformVariable(v.key));
  const secretVars = variables.filter((v) => !isPlatformVariable(v.key));

  // Push non-platform variables via secrets API
  if (secretVars.length > 0) {
    const secretPayload = secretVars.map((v) => ({
      name: v.key,
      value: v.value,
    }));
    await client.createSecrets(projectRef, secretPayload);
    pushed += secretVars.length;
  }

  // Push platform variables via config APIs
  for (const v of platformVars) {
    await setRemoteVariable(client, projectRef, v.key, v.value, v.secret);
    pushed++;
  }

  // Handle prune: delete remote vars not in the local list
  if (options.prune) {
    const localKeys = new Set(variables.map((v) => v.key));
    const remoteVars = await listRemoteVariables(client, projectRef);
    const toDelete = remoteVars.filter((v) => !localKeys.has(v.key));

    for (const v of toDelete) {
      await deleteRemoteVariable(client, projectRef, v.key);
      deleted++;
    }
  }

  return { pushed, deleted };
}
