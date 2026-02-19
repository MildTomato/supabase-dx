/**
 * Canonical environment variable name mapping - re-exported from @supabase-dx/config
 */
export {
  toCanonicalName,
  isEnvRef,
  extractEnvRef,
  getNestedValue,
  validateNoHardcodedSecrets,
  suggestEnvVarName,
} from "@supabase-dx/config";

export { getSensitiveFields } from "@supabase-dx/config";
