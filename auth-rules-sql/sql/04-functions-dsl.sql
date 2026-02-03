-- =============================================================================
-- DSL FUNCTIONS
-- =============================================================================
-- Functions that form the rule definition DSL.
-- These return JSONB that gets stored and later compiled to views.

-- auth.select('col1', 'col2', ...) - specify columns for SELECT
CREATE OR REPLACE FUNCTION auth.select(VARIADIC columns TEXT[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'select', 'columns', to_jsonb(columns))
$$;

-- auth.insert() - mark rule as INSERT operation
CREATE OR REPLACE FUNCTION auth.insert()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'insert')
$$;

-- auth.update() - mark rule as UPDATE operation
CREATE OR REPLACE FUNCTION auth.update()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'update')
$$;

-- auth.delete() - mark rule as DELETE operation
CREATE OR REPLACE FUNCTION auth.delete()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'delete')
$$;

-- auth.user_id() marker for DSL (returns marker, not actual ID)
-- Note: This shadows the real auth.user_id() in DSL context
CREATE OR REPLACE FUNCTION auth.user_id_marker()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'user_id')
$$;

-- auth.one_of('claim_name') - filter by claim membership
CREATE OR REPLACE FUNCTION auth.one_of(claim_name TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'one_of', 'claim', claim_name)
$$;

-- auth.check('claim', 'property', ARRAY['values']) - filter claim by property
CREATE OR REPLACE FUNCTION auth.check(
  claim_name TEXT,
  property TEXT,
  allowed_values TEXT[]
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'type', 'check',
    'claim', claim_name,
    'property', property,
    'values', to_jsonb(allowed_values)
  )
$$;

-- auth.eq('column', value) - equality filter
CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', value)
$$;

-- Overload for auth.eq with UUID literal
CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value UUID)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

-- Overload for auth.eq with TEXT literal
CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

-- Overload for auth.eq with BOOLEAN literal
CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value BOOLEAN)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

-- auth.in('column', 'claim', check) - membership with optional check
CREATE OR REPLACE FUNCTION auth.in_claim(
  column_name TEXT,
  claim_name TEXT,
  check_condition JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'type', 'in',
    'column', column_name,
    'claim', claim_name,
    'check', check_condition
  )
$$;

-- auth.or(...) - OR multiple conditions
CREATE OR REPLACE FUNCTION auth.or_(VARIADIC conditions JSONB[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'or', 'conditions', to_jsonb(conditions))
$$;

-- auth.and(...) - AND multiple conditions
CREATE OR REPLACE FUNCTION auth.and_(VARIADIC conditions JSONB[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'and', 'conditions', to_jsonb(conditions))
$$;
