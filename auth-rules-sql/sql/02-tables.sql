-- =============================================================================
-- RULE STORAGE
-- =============================================================================
-- Tables to store rule definitions. Rules are stored here, then compiled to views.

CREATE TABLE IF NOT EXISTS auth.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('select', 'insert', 'update', 'delete')),
  columns TEXT[],  -- NULL means all columns (for write ops)
  filters JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (table_name, operation)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_rules_table ON auth.rules(table_name);

-- Track generated views/triggers
CREATE TABLE IF NOT EXISTS auth.generated_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES auth.rules(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('view', 'function', 'trigger')),
  object_schema TEXT NOT NULL,
  object_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
