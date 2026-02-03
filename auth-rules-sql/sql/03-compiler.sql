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
