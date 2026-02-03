-- =============================================================================
-- AUTH-RULES SCHEMAS
-- =============================================================================
-- Create the schemas needed for auth-rules system
-- Runs after roles are created but before auth-rules functions

-- API schema: Generated views that wrap public tables with auth
CREATE SCHEMA IF NOT EXISTS api;

-- Claims schema: Views that expose user relationships
CREATE SCHEMA IF NOT EXISTS claims;

-- Grant usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA claims TO anon, authenticated, service_role;

-- Default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA claims GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA claims GRANT ALL ON TABLES TO service_role;

-- Sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT USAGE ON SEQUENCES TO anon, authenticated, service_role;

-- Functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
