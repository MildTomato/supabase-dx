-- =============================================================================
-- AUTH FUNCTIONS
-- =============================================================================
-- Core auth functions that gotrue normally creates, but we need them before
-- gotrue runs its migrations so our auth-rules functions can reference them.
-- Gotrue will replace these with its own versions.

-- Gets the User ID from the JWT
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Gets the role from the JWT
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;

-- Gets the JWT claims
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(
      current_setting('request.jwt.claims', true),
      '{}'
    )::jsonb
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
