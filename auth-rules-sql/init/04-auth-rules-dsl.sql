-- =============================================================================
-- AUTH-RULES DSL FUNCTIONS
-- =============================================================================
-- Functions that form the rule definition DSL

-- Wrapper for use in rules
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid()
$$;

-- auth.select('col1', 'col2', ...)
CREATE OR REPLACE FUNCTION auth.select(VARIADIC columns TEXT[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'select', 'columns', to_jsonb(columns))
$$;

-- auth.insert()
CREATE OR REPLACE FUNCTION auth.insert()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'insert')
$$;

-- auth.update()
CREATE OR REPLACE FUNCTION auth.update()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'update')
$$;

-- auth.delete()
CREATE OR REPLACE FUNCTION auth.delete()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'delete')
$$;

-- Marker for user_id in DSL context
CREATE OR REPLACE FUNCTION auth.user_id_marker()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'user_id')
$$;

-- auth.one_of('claim_name')
CREATE OR REPLACE FUNCTION auth.one_of(claim_name TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'one_of', 'claim', claim_name)
$$;

-- auth.check('claim', 'property', ARRAY['values'])
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

-- auth.eq('column', value) - with JSONB (for nested DSL)
CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', value)
$$;

-- auth.eq overloads for literal values
CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value UUID)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

CREATE OR REPLACE FUNCTION auth.eq(column_name TEXT, value BOOLEAN)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

-- auth.in_claim('column', 'claim', check)
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

-- auth.or_(...)
CREATE OR REPLACE FUNCTION auth.or_(VARIADIC conditions JSONB[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'or', 'conditions', to_jsonb(conditions))
$$;

-- auth.and_(...)
CREATE OR REPLACE FUNCTION auth.and_(VARIADIC conditions JSONB[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('type', 'and', 'conditions', to_jsonb(conditions))
$$;

-- Grant execute on DSL functions
GRANT EXECUTE ON FUNCTION auth.user_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.select(VARIADIC TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION auth.insert() TO service_role;
GRANT EXECUTE ON FUNCTION auth.update() TO service_role;
GRANT EXECUTE ON FUNCTION auth.delete() TO service_role;
GRANT EXECUTE ON FUNCTION auth.user_id_marker() TO service_role;
GRANT EXECUTE ON FUNCTION auth.one_of(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION auth.check(TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION auth.eq(TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION auth.eq(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION auth.eq(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION auth.eq(TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION auth.in_claim(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION auth.or_(VARIADIC JSONB[]) TO service_role;
GRANT EXECUTE ON FUNCTION auth.and_(VARIADIC JSONB[]) TO service_role;
