-- =============================================================================
-- AUTH RULES: TABLES
-- =============================================================================
-- Storage for rule definitions and generated objects

CREATE TABLE IF NOT EXISTS auth_rules.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('select', 'insert', 'update', 'delete')),
  columns TEXT[],
  filters JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (table_name, operation)
);

CREATE TABLE IF NOT EXISTS auth_rules.generated_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES auth_rules.rules(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('view', 'function', 'trigger')),
  object_schema TEXT NOT NULL,
  object_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_table ON auth_rules.rules(table_name);

-- Only service_role can modify rules
GRANT SELECT ON auth_rules.rules TO authenticated;
GRANT ALL ON auth_rules.rules TO service_role;
GRANT SELECT ON auth_rules.generated_objects TO authenticated;
GRANT ALL ON auth_rules.generated_objects TO service_role;
