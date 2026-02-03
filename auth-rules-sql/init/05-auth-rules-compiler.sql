-- =============================================================================
-- AUTH-RULES COMPILER
-- =============================================================================
-- Functions that compile rule definitions into views and triggers

-- Build WHERE clause from filter condition
CREATE OR REPLACE FUNCTION auth._build_where_condition(filter JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  filter_type TEXT;
  result TEXT;
BEGIN
  filter_type := filter->>'type';

  CASE filter_type
    WHEN 'eq' THEN
      DECLARE
        col TEXT := filter->>'column';
        val JSONB := filter->'value';
        val_type TEXT := val->>'type';
      BEGIN
        CASE val_type
          WHEN 'user_id' THEN
            result := format('%I = auth.uid()', col);
          WHEN 'one_of' THEN
            result := format('%I IN (SELECT %I FROM claims.%I WHERE user_id = auth.uid())',
              col,
              regexp_replace(val->>'claim', 's$', '') || '_id',
              val->>'claim'
            );
          WHEN 'literal' THEN
            result := format('%I = %L', col, val->>'value');
          WHEN 'check' THEN
            result := format('%I IN (SELECT %I FROM claims.%I WHERE user_id = auth.uid() AND %I = ANY(%L::text[]))',
              col,
              regexp_replace(val->>'claim', 's$', '') || '_id',
              val->>'claim',
              val->>'property',
              val->'values'
            );
          ELSE
            result := format('%I = %L', col, val);
        END CASE;
      END;

    WHEN 'in' THEN
      DECLARE
        col TEXT := filter->>'column';
        claim TEXT := filter->>'claim';
        chk JSONB := filter->'check';
      BEGIN
        IF chk IS NULL THEN
          result := format('%I IN (SELECT %I FROM claims.%I WHERE user_id = auth.uid())',
            col,
            regexp_replace(claim, 's$', '') || '_id',
            claim
          );
        ELSE
          result := format('%I IN (SELECT %I FROM claims.%I WHERE user_id = auth.uid() AND %I = ANY(%L::text[]))',
            col,
            regexp_replace(claim, 's$', '') || '_id',
            claim,
            chk->>'property',
            chk->'values'
          );
        END IF;
      END;

    WHEN 'or' THEN
      SELECT '(' || string_agg(auth._build_where_condition(cond), ' OR ') || ')'
      INTO result
      FROM jsonb_array_elements(filter->'conditions') AS cond;

    WHEN 'and' THEN
      SELECT '(' || string_agg(auth._build_where_condition(cond), ' AND ') || ')'
      INTO result
      FROM jsonb_array_elements(filter->'conditions') AS cond;

    ELSE
      RAISE EXCEPTION 'Unknown filter type: %', filter_type;
  END CASE;

  RETURN result;
END;
$$;

-- Generate SELECT view
CREATE OR REPLACE FUNCTION auth._generate_select_view(
  p_table_name TEXT,
  p_columns TEXT[],
  p_filters JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  cols TEXT;
  where_clauses TEXT[];
  where_sql TEXT;
  view_sql TEXT;
  filter JSONB;
BEGIN
  cols := array_to_string(p_columns, ', ');

  FOR filter IN SELECT * FROM jsonb_array_elements(p_filters)
  LOOP
    IF filter->>'type' NOT IN ('select', 'insert', 'update', 'delete') THEN
      where_clauses := array_append(where_clauses, auth._build_where_condition(filter));
    END IF;
  END LOOP;

  IF array_length(where_clauses, 1) > 0 THEN
    where_sql := 'WHERE ' || array_to_string(where_clauses, ' AND ');
  ELSE
    where_sql := '';
  END IF;

  view_sql := format(
    'CREATE OR REPLACE VIEW api.%I AS SELECT %s FROM public.%I %s',
    p_table_name, cols, p_table_name, where_sql
  );

  RETURN view_sql;
END;
$$;

-- Generate INSERT trigger
CREATE OR REPLACE FUNCTION auth._generate_insert_trigger(
  p_table_name TEXT,
  p_filters JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  func_name TEXT;
  trigger_name TEXT;
  validations TEXT := '';
  filter JSONB;
  col TEXT;
  val JSONB;
  val_type TEXT;
BEGIN
  func_name := format('api.%I_insert_trigger', p_table_name);
  trigger_name := format('%I_insert', p_table_name);

  FOR filter IN SELECT * FROM jsonb_array_elements(p_filters)
  LOOP
    IF filter->>'type' = 'eq' THEN
      col := filter->>'column';
      val := filter->'value';
      val_type := val->>'type';

      IF val_type = 'user_id' THEN
        validations := validations || format($v$
  IF NEW.%I IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION '%I must match authenticated user' USING ERRCODE = '42501';
  END IF;
$v$, col, col);
      ELSIF val_type = 'one_of' THEN
        validations := validations || format($v$
  IF NOT EXISTS (
    SELECT 1 FROM claims.%I WHERE user_id = auth.uid() AND %I = NEW.%I
  ) THEN
    RAISE EXCEPTION 'Not authorized for this %I' USING ERRCODE = '42501';
  END IF;
$v$, val->>'claim', regexp_replace(val->>'claim', 's$', '') || '_id', col, regexp_replace(val->>'claim', 's$', ''));
      END IF;
    END IF;
  END LOOP;

  RETURN format($f$
CREATE OR REPLACE FUNCTION %s()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, claims, auth
AS $t$
BEGIN%s
  INSERT INTO public.%I SELECT NEW.*;
  RETURN NEW;
END;
$t$;

DROP TRIGGER IF EXISTS %I ON api.%I;
CREATE TRIGGER %I INSTEAD OF INSERT ON api.%I
FOR EACH ROW EXECUTE FUNCTION %s();
$f$, func_name, validations, p_table_name, trigger_name, p_table_name, trigger_name, p_table_name, func_name);
END;
$$;

-- Generate UPDATE trigger
CREATE OR REPLACE FUNCTION auth._generate_update_trigger(
  p_table_name TEXT,
  p_filters JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  func_name TEXT;
  trigger_name TEXT;
  where_clauses TEXT[] := ARRAY['id = OLD.id'];
  filter JSONB;
  col TEXT;
  val JSONB;
  val_type TEXT;
BEGIN
  func_name := format('api.%I_update_trigger', p_table_name);
  trigger_name := format('%I_update', p_table_name);

  FOR filter IN SELECT * FROM jsonb_array_elements(p_filters)
  LOOP
    IF filter->>'type' = 'eq' THEN
      col := filter->>'column';
      val := filter->'value';
      val_type := val->>'type';

      IF val_type = 'user_id' THEN
        where_clauses := array_append(where_clauses, format('%I = auth.uid()', col));
      ELSIF val_type = 'one_of' THEN
        where_clauses := array_append(where_clauses,
          format('%I IN (SELECT %I FROM claims.%I WHERE user_id = auth.uid())',
            col, regexp_replace(val->>'claim', 's$', '') || '_id', val->>'claim'));
      END IF;
    END IF;
  END LOOP;

  RETURN format($f$
CREATE OR REPLACE FUNCTION %s()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, claims, auth
AS $t$
DECLARE v_count INT;
BEGIN
  UPDATE public.%I SET %I = NEW WHERE %s;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Record not found or not authorized' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END;
$t$;

DROP TRIGGER IF EXISTS %I ON api.%I;
CREATE TRIGGER %I INSTEAD OF UPDATE ON api.%I
FOR EACH ROW EXECUTE FUNCTION %s();
$f$, func_name, p_table_name, p_table_name, array_to_string(where_clauses, ' AND '),
    trigger_name, p_table_name, trigger_name, p_table_name, func_name);
END;
$$;

-- Generate DELETE trigger
CREATE OR REPLACE FUNCTION auth._generate_delete_trigger(
  p_table_name TEXT,
  p_filters JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  func_name TEXT;
  trigger_name TEXT;
  where_clauses TEXT[] := ARRAY['id = OLD.id'];
  filter JSONB;
  col TEXT;
  val JSONB;
  val_type TEXT;
BEGIN
  func_name := format('api.%I_delete_trigger', p_table_name);
  trigger_name := format('%I_delete', p_table_name);

  FOR filter IN SELECT * FROM jsonb_array_elements(p_filters)
  LOOP
    IF filter->>'type' = 'eq' THEN
      col := filter->>'column';
      val := filter->'value';
      val_type := val->>'type';

      IF val_type = 'user_id' THEN
        where_clauses := array_append(where_clauses, format('%I = auth.uid()', col));
      ELSIF val_type = 'one_of' THEN
        where_clauses := array_append(where_clauses,
          format('%I IN (SELECT %I FROM claims.%I WHERE user_id = auth.uid())',
            col, regexp_replace(val->>'claim', 's$', '') || '_id', val->>'claim'));
      END IF;
    END IF;
  END LOOP;

  RETURN format($f$
CREATE OR REPLACE FUNCTION %s()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, claims, auth
AS $t$
BEGIN
  DELETE FROM public.%I WHERE %s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found or not authorized' USING ERRCODE = 'P0002';
  END IF;
  RETURN OLD;
END;
$t$;

DROP TRIGGER IF EXISTS %I ON api.%I;
CREATE TRIGGER %I INSTEAD OF DELETE ON api.%I
FOR EACH ROW EXECUTE FUNCTION %s();
$f$, func_name, p_table_name, array_to_string(where_clauses, ' AND '),
    trigger_name, p_table_name, trigger_name, p_table_name, func_name);
END;
$$;
