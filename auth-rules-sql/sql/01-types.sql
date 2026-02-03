-- =============================================================================
-- TYPES
-- =============================================================================
-- Types used by the auth-rules system.

-- Rule operation type
DO $$ BEGIN
  CREATE TYPE auth.rule_operation AS ENUM ('select', 'insert', 'update', 'delete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Filter condition type (for building WHERE clauses)
CREATE TYPE auth.filter_condition AS (
  column_name TEXT,
  operator TEXT,
  value_type TEXT,      -- 'user_id', 'one_of', 'literal', 'check'
  value TEXT,           -- claim name or literal value
  check_claim TEXT,     -- for auth.check(): the claim to check
  check_property TEXT,  -- for auth.check(): the property to check
  check_values TEXT[]   -- for auth.check(): allowed values
);

-- Rule definition type
CREATE TYPE auth.rule_definition AS (
  table_name TEXT,
  operation auth.rule_operation,
  columns TEXT[],
  filters auth.filter_condition[]
);
