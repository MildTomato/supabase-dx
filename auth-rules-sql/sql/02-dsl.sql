-- =============================================================================
-- AUTH RULES: DSL FUNCTIONS
-- =============================================================================
-- Functions that form the rule definition language

-- Wrapper for auth.uid()
CREATE OR REPLACE FUNCTION auth_rules.user_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT auth.uid()
$$;

-- Operation markers
CREATE OR REPLACE FUNCTION auth_rules.select(VARIADIC columns TEXT[])
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'select', 'columns', to_jsonb(columns))
$$;

CREATE OR REPLACE FUNCTION auth_rules.insert()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'insert')
$$;

CREATE OR REPLACE FUNCTION auth_rules.update()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'update')
$$;

CREATE OR REPLACE FUNCTION auth_rules.delete()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'delete')
$$;

-- User ID marker for DSL
CREATE OR REPLACE FUNCTION auth_rules.user_id_marker()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'user_id')
$$;

-- Claim reference
CREATE OR REPLACE FUNCTION auth_rules.one_of(claim_name TEXT)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'one_of', 'claim', claim_name)
$$;

-- Claim property check
CREATE OR REPLACE FUNCTION auth_rules.check(claim_name TEXT, property TEXT, allowed_values TEXT[])
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'check', 'claim', claim_name, 'property', property, 'values', to_jsonb(allowed_values))
$$;

-- Equality filter (JSONB value - for nested DSL)
CREATE OR REPLACE FUNCTION auth_rules.eq(column_name TEXT, value JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', value)
$$;

-- Equality filter overloads for literals
CREATE OR REPLACE FUNCTION auth_rules.eq(column_name TEXT, value UUID)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

CREATE OR REPLACE FUNCTION auth_rules.eq(column_name TEXT, value TEXT)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

CREATE OR REPLACE FUNCTION auth_rules.eq(column_name TEXT, value BOOLEAN)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'eq', 'column', column_name, 'value', jsonb_build_object('type', 'literal', 'value', value))
$$;

-- IN claim with optional check
CREATE OR REPLACE FUNCTION auth_rules.in_claim(column_name TEXT, claim_name TEXT, check_condition JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'in', 'column', column_name, 'claim', claim_name, 'check', check_condition)
$$;

-- Boolean combinators
CREATE OR REPLACE FUNCTION auth_rules.or_(VARIADIC conditions JSONB[])
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'or', 'conditions', to_jsonb(conditions))
$$;

CREATE OR REPLACE FUNCTION auth_rules.and_(VARIADIC conditions JSONB[])
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'and', 'conditions', to_jsonb(conditions))
$$;

-- Grant execute to service_role (rules are defined by admins)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth_rules TO service_role;
