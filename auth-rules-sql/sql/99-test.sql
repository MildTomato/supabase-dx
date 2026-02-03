-- =============================================================================
-- TEST SETUP
-- =============================================================================
-- Test the auth-rules system.
--
-- Requires:
--   1. external/auth/migrations/* loaded first (provides auth.uid, auth.role, etc.)
--   2. auth-rules-sql/sql/00-07 loaded

-- Create test schema
CREATE SCHEMA IF NOT EXISTS test;

-- Helper to simulate authenticated user (sets JWT claim that auth.uid() reads)
CREATE OR REPLACE FUNCTION test.set_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, TRUE);
END;
$$;

-- =============================================================================
-- TEST TABLES (in public schema)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_role ON public.org_members(user_id, role);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON public.documents(org_id);

-- =============================================================================
-- CLAIMS VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW claims.org_ids AS
SELECT user_id, org_id
FROM public.org_members;

CREATE OR REPLACE VIEW claims.org_roles AS
SELECT user_id, org_id, role
FROM public.org_members;

GRANT SELECT ON claims.org_ids TO authenticated;
GRANT SELECT ON claims.org_roles TO authenticated;

-- =============================================================================
-- TEST DATA
-- =============================================================================

-- Clear existing test data
TRUNCATE public.documents CASCADE;
TRUNCATE public.org_members CASCADE;
TRUNCATE public.organizations CASCADE;

-- Insert test orgs
INSERT INTO public.organizations (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Org One'),
  ('22222222-2222-2222-2222-222222222222', 'Org Two');

-- Insert test memberships
INSERT INTO public.org_members (org_id, user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member'),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'viewer');

-- Insert test documents
INSERT INTO public.documents (org_id, title, content, created_by) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Doc in Org One', 'Content 1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'Doc in Org Two', 'Content 2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- =============================================================================
-- DEFINE RULES
-- =============================================================================

-- Organizations: members can view their orgs
SELECT auth.rule('organizations',
  auth.select('id', 'name', 'created_at'),
  auth.eq('id', auth.one_of('org_ids'))
);

-- Documents: org members can view, with public fallback
SELECT auth.rule('documents',
  auth.select('id', 'org_id', 'title', 'is_public', 'created_by', 'created_at'),
  auth.or_(
    auth.eq('is_public', true),
    auth.eq('org_id', auth.one_of('org_ids'))
  )
);

-- Documents: insert (org members, must set created_by to self)
SELECT auth.rule('documents',
  auth.insert(),
  auth.eq('org_id', auth.one_of('org_ids')),
  auth.eq('created_by', auth.user_id_marker())
);

-- Documents: update (only creator)
SELECT auth.rule('documents',
  auth.update(),
  auth.eq('created_by', auth.user_id_marker())
);

-- Documents: delete (only creator)
SELECT auth.rule('documents',
  auth.delete(),
  auth.eq('created_by', auth.user_id_marker())
);

-- =============================================================================
-- RUN TESTS
-- =============================================================================

-- Test as User A (member of both orgs)
SELECT test.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

DO $$
DECLARE
  org_count INT;
  doc_count INT;
BEGIN
  SELECT count(*) INTO org_count FROM api.organizations;
  SELECT count(*) INTO doc_count FROM api.documents;

  ASSERT org_count = 2, format('User A should see 2 orgs, got %s', org_count);
  ASSERT doc_count = 2, format('User A should see 2 docs, got %s', doc_count);

  RAISE NOTICE 'User A tests passed: % orgs, % docs', org_count, doc_count;
END;
$$;

-- Test as User B (only in Org One as viewer)
SELECT test.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

DO $$
DECLARE
  org_count INT;
  doc_count INT;
BEGIN
  SELECT count(*) INTO org_count FROM api.organizations;
  SELECT count(*) INTO doc_count FROM api.documents;

  ASSERT org_count = 1, format('User B should see 1 org, got %s', org_count);
  ASSERT doc_count = 1, format('User B should see 1 doc, got %s', doc_count);

  RAISE NOTICE 'User B tests passed: % orgs, % docs', org_count, doc_count;
END;
$$;

-- Test as anonymous (no user set)
SELECT test.set_user(NULL);

DO $$
DECLARE
  org_count INT;
  doc_count INT;
BEGIN
  SELECT count(*) INTO org_count FROM api.organizations;
  SELECT count(*) INTO doc_count FROM api.documents;

  ASSERT org_count = 0, format('Anonymous should see 0 orgs, got %s', org_count);
  -- Anonymous might see public docs if any

  RAISE NOTICE 'Anonymous tests passed: % orgs, % docs', org_count, doc_count;
END;
$$;

RAISE NOTICE 'All tests passed!';
