-- =============================================================================
-- auth.rule() - MAIN ENTRY POINT
-- =============================================================================

CREATE OR REPLACE FUNCTION auth.rule(
  p_table_name TEXT,
  VARIADIC p_parts JSONB[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  part JSONB;
  operation TEXT := 'select';
  columns TEXT[];
  filters JSONB := '[]'::JSONB;
  rule_id UUID;
  generated_sql TEXT := '';
BEGIN
  -- Parse the parts
  FOREACH part IN ARRAY p_parts
  LOOP
    CASE part->>'type'
      WHEN 'select' THEN
        operation := 'select';
        SELECT array_agg(col::TEXT) INTO columns
        FROM jsonb_array_elements_text(part->'columns') AS col;
      WHEN 'insert' THEN operation := 'insert';
      WHEN 'update' THEN operation := 'update';
      WHEN 'delete' THEN operation := 'delete';
      ELSE filters := filters || jsonb_build_array(part);
    END CASE;
  END LOOP;

  -- Store the rule
  INSERT INTO auth.rules (table_name, operation, columns, filters)
  VALUES (p_table_name, operation, columns, filters)
  ON CONFLICT (table_name, operation)
  DO UPDATE SET columns = EXCLUDED.columns, filters = EXCLUDED.filters, updated_at = now()
  RETURNING id INTO rule_id;

  -- Clean up old generated objects
  DELETE FROM auth.generated_objects WHERE rule_id = rule_id;

  -- Generate based on operation
  CASE operation
    WHEN 'select' THEN
      generated_sql := auth._generate_select_view(p_table_name, columns, filters);
      EXECUTE generated_sql;
      EXECUTE format('GRANT SELECT ON api.%I TO anon, authenticated', p_table_name);
      INSERT INTO auth.generated_objects (rule_id, object_type, object_schema, object_name)
      VALUES (rule_id, 'view', 'api', p_table_name);

    WHEN 'insert' THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'api' AND table_name = p_table_name) THEN
        RAISE EXCEPTION 'Must define SELECT rule before INSERT rule for table %', p_table_name;
      END IF;
      generated_sql := auth._generate_insert_trigger(p_table_name, filters);
      EXECUTE generated_sql;
      EXECUTE format('GRANT INSERT ON api.%I TO authenticated', p_table_name);
      INSERT INTO auth.generated_objects (rule_id, object_type, object_schema, object_name)
      VALUES (rule_id, 'function', 'api', p_table_name || '_insert_trigger'),
             (rule_id, 'trigger', 'api', p_table_name || '_insert');

    WHEN 'update' THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'api' AND table_name = p_table_name) THEN
        RAISE EXCEPTION 'Must define SELECT rule before UPDATE rule for table %', p_table_name;
      END IF;
      generated_sql := auth._generate_update_trigger(p_table_name, filters);
      EXECUTE generated_sql;
      EXECUTE format('GRANT UPDATE ON api.%I TO authenticated', p_table_name);
      INSERT INTO auth.generated_objects (rule_id, object_type, object_schema, object_name)
      VALUES (rule_id, 'function', 'api', p_table_name || '_update_trigger'),
             (rule_id, 'trigger', 'api', p_table_name || '_update');

    WHEN 'delete' THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'api' AND table_name = p_table_name) THEN
        RAISE EXCEPTION 'Must define SELECT rule before DELETE rule for table %', p_table_name;
      END IF;
      generated_sql := auth._generate_delete_trigger(p_table_name, filters);
      EXECUTE generated_sql;
      EXECUTE format('GRANT DELETE ON api.%I TO authenticated', p_table_name);
      INSERT INTO auth.generated_objects (rule_id, object_type, object_schema, object_name)
      VALUES (rule_id, 'function', 'api', p_table_name || '_delete_trigger'),
             (rule_id, 'trigger', 'api', p_table_name || '_delete');
  END CASE;

  RETURN format('Rule created: api.%s (%s)', p_table_name, operation);
END;
$$;

-- Helper to drop all rules for a table
CREATE OR REPLACE FUNCTION auth.drop_rules(p_table_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  obj RECORD;
  count INT := 0;
BEGIN
  FOR obj IN
    SELECT go.* FROM auth.generated_objects go
    JOIN auth.rules r ON r.id = go.rule_id
    WHERE r.table_name = p_table_name AND go.object_type = 'trigger'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', obj.object_name, obj.object_schema, p_table_name);
    count := count + 1;
  END LOOP;

  FOR obj IN
    SELECT go.* FROM auth.generated_objects go
    JOIN auth.rules r ON r.id = go.rule_id
    WHERE r.table_name = p_table_name AND go.object_type = 'function'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I()', obj.object_schema, obj.object_name);
    count := count + 1;
  END LOOP;

  FOR obj IN
    SELECT go.* FROM auth.generated_objects go
    JOIN auth.rules r ON r.id = go.rule_id
    WHERE r.table_name = p_table_name AND go.object_type = 'view'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I', obj.object_schema, obj.object_name);
    count := count + 1;
  END LOOP;

  DELETE FROM auth.rules WHERE table_name = p_table_name;
  RETURN format('Dropped %s objects for table %s', count, p_table_name);
END;
$$;

-- List all rules
CREATE OR REPLACE FUNCTION auth.list_rules()
RETURNS TABLE (table_name TEXT, operation TEXT, columns TEXT[], filters JSONB, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT table_name, operation, columns, filters, created_at FROM auth.rules ORDER BY table_name, operation;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION auth.rule(TEXT, VARIADIC JSONB[]) TO service_role;
GRANT EXECUTE ON FUNCTION auth.drop_rules(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION auth.list_rules() TO service_role;
