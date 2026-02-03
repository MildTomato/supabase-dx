-- =============================================================================
-- AUTH RULES: SCHEMA SETUP
-- =============================================================================
-- Creates schemas for the auth-rules system.
-- Assumes running on Supabase (auth.uid, authenticated role, etc. exist)

-- System schema: tables and functions for auth-rules
CREATE SCHEMA IF NOT EXISTS auth_rules;

-- Claims schema: views that expose user relationships
CREATE SCHEMA IF NOT EXISTS auth_rules_claims;

-- Data API schema: generated views that wrap public tables
CREATE SCHEMA IF NOT EXISTS data_api;

-- Grants
GRANT USAGE ON SCHEMA auth_rules TO authenticated, service_role;
GRANT USAGE ON SCHEMA auth_rules_claims TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA data_api TO anon, authenticated, service_role;

-- Default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_rules_claims GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA data_api GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA data_api GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
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
-- =============================================================================
-- AUTH RULES: COMPILER
-- =============================================================================
-- Functions that compile rule definitions into views and triggers

-- Build WHERE clause from filter
CREATE OR REPLACE FUNCTION auth_rules._build_where(filter JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  ftype TEXT := filter->>'type';
  col TEXT;
  val JSONB;
  vtype TEXT;
  claim TEXT;
  result TEXT;
BEGIN
  CASE ftype
    WHEN 'eq' THEN
      col := filter->>'column';
      val := filter->'value';
      vtype := val->>'type';

      CASE vtype
        WHEN 'user_id' THEN
          RETURN format('%I = auth.uid()', col);
        WHEN 'one_of' THEN
          claim := val->>'claim';
          RETURN format('%I IN (SELECT %I FROM auth_rules_claims.%I WHERE user_id = auth.uid())',
            col, regexp_replace(claim, 's$', '') || '_id', claim);
        WHEN 'literal' THEN
          RETURN format('%I = %L', col, val->>'value');
        WHEN 'check' THEN
          claim := val->>'claim';
          RETURN format('%I IN (SELECT %I FROM auth_rules_claims.%I WHERE user_id = auth.uid() AND %I = ANY(%L::text[]))',
            col, regexp_replace(claim, 's$', '') || '_id', claim, val->>'property', val->'values');
        ELSE
          RETURN format('%I = %L', col, val);
      END CASE;

    WHEN 'in' THEN
      col := filter->>'column';
      claim := filter->>'claim';
      IF filter->'check' IS NULL THEN
        RETURN format('%I IN (SELECT %I FROM auth_rules_claims.%I WHERE user_id = auth.uid())',
          col, regexp_replace(claim, 's$', '') || '_id', claim);
      ELSE
        RETURN format('%I IN (SELECT %I FROM auth_rules_claims.%I WHERE user_id = auth.uid() AND %I = ANY(%L::text[]))',
          col, regexp_replace(claim, 's$', '') || '_id', claim, filter->'check'->>'property', filter->'check'->'values');
      END IF;

    WHEN 'or' THEN
      SELECT '(' || string_agg(auth_rules._build_where(c), ' OR ') || ')'
      INTO result FROM jsonb_array_elements(filter->'conditions') c;
      RETURN result;

    WHEN 'and' THEN
      SELECT '(' || string_agg(auth_rules._build_where(c), ' AND ') || ')'
      INTO result FROM jsonb_array_elements(filter->'conditions') c;
      RETURN result;

    ELSE
      RAISE EXCEPTION 'Unknown filter type: %', ftype;
  END CASE;
END;
$$;

-- Generate SELECT view
CREATE OR REPLACE FUNCTION auth_rules._gen_select_view(p_table TEXT, p_cols TEXT[], p_filters JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  where_parts TEXT[];
  f JSONB;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
    IF f->>'type' NOT IN ('select', 'insert', 'update', 'delete') THEN
      where_parts := array_append(where_parts, auth_rules._build_where(f));
    END IF;
  END LOOP;

  RETURN format('CREATE OR REPLACE VIEW data_api.%I AS SELECT %s FROM public.%I %s',
    p_table,
    array_to_string(p_cols, ', '),
    p_table,
    CASE WHEN array_length(where_parts, 1) > 0 THEN 'WHERE ' || array_to_string(where_parts, ' AND ') ELSE '' END
  );
END;
$$;

-- Generate INSERT trigger
CREATE OR REPLACE FUNCTION auth_rules._gen_insert_trigger(p_table TEXT, p_filters JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  validations TEXT := '';
  f JSONB;
  col TEXT;
  val JSONB;
  vtype TEXT;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
    IF f->>'type' = 'eq' THEN
      col := f->>'column';
      val := f->'value';
      vtype := val->>'type';

      IF vtype = 'user_id' THEN
        validations := validations || format($v$
  IF NEW.%I IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION '%I must match authenticated user' USING ERRCODE = '42501';
  END IF;$v$, col, col);
      ELSIF vtype = 'one_of' THEN
        validations := validations || format($v$
  IF NOT EXISTS (SELECT 1 FROM auth_rules_claims.%I WHERE user_id = auth.uid() AND %I = NEW.%I) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;$v$, val->>'claim', regexp_replace(val->>'claim', 's$', '') || '_id', col);
      END IF;
    END IF;
  END LOOP;

  RETURN format($f$
CREATE OR REPLACE FUNCTION data_api.%I_insert_trigger() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $t$
BEGIN%s
  INSERT INTO public.%I SELECT NEW.*;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS %I_insert ON data_api.%I;
CREATE TRIGGER %I_insert INSTEAD OF INSERT ON data_api.%I FOR EACH ROW EXECUTE FUNCTION data_api.%I_insert_trigger();
$f$, p_table, validations, p_table, p_table, p_table, p_table, p_table, p_table);
END;
$$;

-- Generate UPDATE trigger
CREATE OR REPLACE FUNCTION auth_rules._gen_update_trigger(p_table TEXT, p_filters JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  where_parts TEXT[] := ARRAY['id = OLD.id'];
  f JSONB;
  col TEXT;
  val JSONB;
  vtype TEXT;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
    IF f->>'type' = 'eq' THEN
      col := f->>'column';
      val := f->'value';
      vtype := val->>'type';

      IF vtype = 'user_id' THEN
        where_parts := array_append(where_parts, format('%I = auth.uid()', col));
      ELSIF vtype = 'one_of' THEN
        where_parts := array_append(where_parts, format('%I IN (SELECT %I FROM auth_rules_claims.%I WHERE user_id = auth.uid())',
          col, regexp_replace(val->>'claim', 's$', '') || '_id', val->>'claim'));
      END IF;
    END IF;
  END LOOP;

  RETURN format($f$
CREATE OR REPLACE FUNCTION data_api.%I_update_trigger() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $t$
BEGIN
  UPDATE public.%I SET id = NEW.id WHERE %s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or not authorized' USING ERRCODE = 'P0002'; END IF;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS %I_update ON data_api.%I;
CREATE TRIGGER %I_update INSTEAD OF UPDATE ON data_api.%I FOR EACH ROW EXECUTE FUNCTION data_api.%I_update_trigger();
$f$, p_table, p_table, array_to_string(where_parts, ' AND '), p_table, p_table, p_table, p_table, p_table);
END;
$$;

-- Generate DELETE trigger
CREATE OR REPLACE FUNCTION auth_rules._gen_delete_trigger(p_table TEXT, p_filters JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  where_parts TEXT[] := ARRAY['id = OLD.id'];
  f JSONB;
  col TEXT;
  val JSONB;
  vtype TEXT;
BEGIN
  FOR f IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
    IF f->>'type' = 'eq' THEN
      col := f->>'column';
      val := f->'value';
      vtype := val->>'type';

      IF vtype = 'user_id' THEN
        where_parts := array_append(where_parts, format('%I = auth.uid()', col));
      ELSIF vtype = 'one_of' THEN
        where_parts := array_append(where_parts, format('%I IN (SELECT %I FROM auth_rules_claims.%I WHERE user_id = auth.uid())',
          col, regexp_replace(val->>'claim', 's$', '') || '_id', val->>'claim'));
      END IF;
    END IF;
  END LOOP;

  RETURN format($f$
CREATE OR REPLACE FUNCTION data_api.%I_delete_trigger() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $t$
BEGIN
  DELETE FROM public.%I WHERE %s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or not authorized' USING ERRCODE = 'P0002'; END IF;
  RETURN OLD;
END;
$t$;
DROP TRIGGER IF EXISTS %I_delete ON data_api.%I;
CREATE TRIGGER %I_delete INSTEAD OF DELETE ON data_api.%I FOR EACH ROW EXECUTE FUNCTION data_api.%I_delete_trigger();
$f$, p_table, p_table, array_to_string(where_parts, ' AND '), p_table, p_table, p_table, p_table, p_table);
END;
$$;
-- =============================================================================
-- AUTH RULES: MAIN ENTRY POINT
-- =============================================================================

CREATE OR REPLACE FUNCTION auth_rules.rule(p_table TEXT, VARIADIC p_parts JSONB[])
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  part JSONB;
  op TEXT := 'select';
  cols TEXT[];
  filters JSONB := '[]'::JSONB;
  rule_id UUID;
  sql TEXT;
BEGIN
  -- Parse parts
  FOREACH part IN ARRAY p_parts LOOP
    CASE part->>'type'
      WHEN 'select' THEN
        op := 'select';
        SELECT array_agg(c::TEXT) INTO cols FROM jsonb_array_elements_text(part->'columns') c;
      WHEN 'insert' THEN op := 'insert';
      WHEN 'update' THEN op := 'update';
      WHEN 'delete' THEN op := 'delete';
      ELSE filters := filters || jsonb_build_array(part);
    END CASE;
  END LOOP;

  -- Store rule
  INSERT INTO auth_rules.rules (table_name, operation, columns, filters)
  VALUES (p_table, op, cols, filters)
  ON CONFLICT (table_name, operation) DO UPDATE
  SET columns = EXCLUDED.columns, filters = EXCLUDED.filters, updated_at = now()
  RETURNING id INTO rule_id;

  -- Clean old generated objects
  DELETE FROM auth_rules.generated_objects WHERE rule_id = rule_id;

  -- Generate
  CASE op
    WHEN 'select' THEN
      sql := auth_rules._gen_select_view(p_table, cols, filters);
      EXECUTE sql;
      EXECUTE format('GRANT SELECT ON data_api.%I TO anon, authenticated', p_table);
      INSERT INTO auth_rules.generated_objects (rule_id, object_type, object_schema, object_name)
      VALUES (rule_id, 'view', 'data_api', p_table);

    WHEN 'insert' THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'data_api' AND table_name = p_table) THEN
        RAISE EXCEPTION 'Define SELECT rule before INSERT for %', p_table;
      END IF;
      sql := auth_rules._gen_insert_trigger(p_table, filters);
      EXECUTE sql;
      EXECUTE format('GRANT INSERT ON data_api.%I TO authenticated', p_table);

    WHEN 'update' THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'data_api' AND table_name = p_table) THEN
        RAISE EXCEPTION 'Define SELECT rule before UPDATE for %', p_table;
      END IF;
      sql := auth_rules._gen_update_trigger(p_table, filters);
      EXECUTE sql;
      EXECUTE format('GRANT UPDATE ON data_api.%I TO authenticated', p_table);

    WHEN 'delete' THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'data_api' AND table_name = p_table) THEN
        RAISE EXCEPTION 'Define SELECT rule before DELETE for %', p_table;
      END IF;
      sql := auth_rules._gen_delete_trigger(p_table, filters);
      EXECUTE sql;
      EXECUTE format('GRANT DELETE ON data_api.%I TO authenticated', p_table);
  END CASE;

  RETURN format('Rule: data_api.%s (%s)', p_table, op);
END;
$$;

-- Drop rules for a table
CREATE OR REPLACE FUNCTION auth_rules.drop_rules(p_table TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  obj RECORD;
  cnt INT := 0;
BEGIN
  FOR obj IN SELECT go.* FROM auth_rules.generated_objects go JOIN auth_rules.rules r ON r.id = go.rule_id WHERE r.table_name = p_table LOOP
    IF obj.object_type = 'trigger' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', obj.object_name, obj.object_schema, p_table);
    ELSIF obj.object_type = 'function' THEN
      EXECUTE format('DROP FUNCTION IF EXISTS %I.%I()', obj.object_schema, obj.object_name);
    ELSIF obj.object_type = 'view' THEN
      EXECUTE format('DROP VIEW IF EXISTS %I.%I', obj.object_schema, obj.object_name);
    END IF;
    cnt := cnt + 1;
  END LOOP;
  DELETE FROM auth_rules.rules WHERE table_name = p_table;
  RETURN format('Dropped %s objects for %s', cnt, p_table);
END;
$$;

-- List rules
CREATE OR REPLACE FUNCTION auth_rules.list_rules()
RETURNS TABLE (table_name TEXT, operation TEXT, columns TEXT[], filters JSONB)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT table_name, operation, columns, filters FROM auth_rules.rules ORDER BY table_name, operation;
$$;

GRANT EXECUTE ON FUNCTION auth_rules.rule(TEXT, VARIADIC JSONB[]) TO service_role;
GRANT EXECUTE ON FUNCTION auth_rules.drop_rules(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION auth_rules.list_rules() TO service_role;
