-- =============================================================================
-- AUTH-RULES SCHEMA SETUP
-- =============================================================================
-- Requires: Supabase auth schema (external/auth/migrations)
-- Provides: api, claims schemas + auth-rules functions in auth schema
--
-- Load order:
--   1. external/auth/migrations/* (provides auth.uid, auth.role, auth.users, etc.)
--   2. This file and subsequent auth-rules SQL files

-- API schema: Generated views that wrap public tables with auth
CREATE SCHEMA IF NOT EXISTS api;

-- Claims schema: Views that expose user relationships
CREATE SCHEMA IF NOT EXISTS claims;

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA api TO authenticated;
GRANT USAGE ON SCHEMA claims TO authenticated;

-- Default privileges for future objects in these schemas
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA claims GRANT SELECT ON TABLES TO authenticated;
