-- =============================================================================
-- GRANTS
-- =============================================================================
-- Permissions for the auth-rules system.

-- Allow authenticated users to call DSL functions (for inspection, not execution)
GRANT EXECUTE ON FUNCTION auth.user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.get_claim_ids(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_claim(TEXT, TEXT, UUID, TEXT, TEXT[]) TO authenticated;

-- Rule definition functions should only be callable by privileged roles
-- (service_role or postgres)
REVOKE EXECUTE ON FUNCTION auth.rule(TEXT, VARIADIC JSONB[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth.drop_rules(TEXT) FROM PUBLIC;

-- Internal compiler functions are not directly callable
REVOKE EXECUTE ON FUNCTION auth._build_where_condition(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth._generate_select_view(TEXT, TEXT[], JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth._generate_insert_trigger(TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth._generate_update_trigger(TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth._generate_delete_trigger(TEXT, JSONB) FROM PUBLIC;
