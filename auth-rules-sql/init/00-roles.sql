-- =============================================================================
-- ROLES AND USERS
-- =============================================================================
-- Create the roles and users needed for Supabase + PostgREST

-- Supabase admin (used by gotrue for migrations)
CREATE USER supabase_admin LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS;

-- Auth admin (used by gotrue)
CREATE USER supabase_auth_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION PASSWORD 'root';

-- PostgREST authenticator (switches to other roles based on JWT)
CREATE USER authenticator NOINHERIT LOGIN PASSWORD 'authenticator';

-- Anonymous role (unauthenticated requests)
CREATE ROLE anon NOLOGIN NOINHERIT;

-- Authenticated role (logged-in users)
CREATE ROLE authenticated NOLOGIN NOINHERIT;

-- Service role (bypasses RLS, used by backend services)
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;

-- Grant role switching to authenticator
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

-- Create auth schema for gotrue
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT CREATE ON DATABASE postgres TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
ALTER USER supabase_auth_admin SET search_path = 'auth';
