-- =============================================================================
-- CORE FUNCTIONS
-- =============================================================================
-- Core utility functions for auth-rules.
-- Requires: auth.uid() from Supabase auth schema

-- Wrapper around auth.uid() for consistency in rule definitions
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid()
$$;

COMMENT ON FUNCTION auth.user_id() IS
  'Returns current authenticated user ID. Wrapper around auth.uid() for use in rule definitions.';

-- Helper to get claim IDs for current user
CREATE OR REPLACE FUNCTION auth.get_claim_ids(claim_name TEXT, id_column TEXT DEFAULT NULL)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result UUID[];
  col_name TEXT;
BEGIN
  -- Default column name is claim_name without trailing 's' + '_id'
  -- e.g., 'org_ids' -> 'org_id'
  col_name := COALESCE(id_column, regexp_replace(claim_name, 's$', '') || '_id');

  EXECUTE format(
    'SELECT ARRAY(SELECT %I FROM claims.%I WHERE user_id = auth.uid())',
    col_name, claim_name
  ) INTO result;

  RETURN COALESCE(result, ARRAY[]::UUID[]);
END;
$$;

COMMENT ON FUNCTION auth.get_claim_ids(TEXT, TEXT) IS
  'Returns array of IDs from a claims view for the current user.';

-- Check if user has specific claim value
CREATE OR REPLACE FUNCTION auth.has_claim(
  claim_name TEXT,
  id_column TEXT,
  id_value UUID,
  check_property TEXT DEFAULT NULL,
  allowed_values TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result BOOLEAN;
BEGIN
  IF check_property IS NULL THEN
    -- Simple membership check
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM claims.%I WHERE user_id = auth.uid() AND %I = $1)',
      claim_name, id_column
    ) INTO result USING id_value;
  ELSE
    -- Check with property filter
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM claims.%I WHERE user_id = auth.uid() AND %I = $1 AND %I = ANY($2))',
      claim_name, id_column, check_property
    ) INTO result USING id_value, allowed_values;
  END IF;

  RETURN COALESCE(result, FALSE);
END;
$$;

COMMENT ON FUNCTION auth.has_claim(TEXT, TEXT, UUID, TEXT, TEXT[]) IS
  'Check if current user has a specific claim, optionally with property filter.';
