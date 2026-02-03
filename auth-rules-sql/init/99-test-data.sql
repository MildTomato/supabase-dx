-- =============================================================================
-- TEST DATA
-- =============================================================================
-- Sample tables and claims for testing

-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Org members
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);

-- Documents
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

-- Grant access to tables
GRANT ALL ON public.organizations TO authenticated, service_role;
GRANT ALL ON public.org_members TO authenticated, service_role;
GRANT ALL ON public.documents TO authenticated, service_role;
GRANT SELECT ON public.organizations TO anon;
GRANT SELECT ON public.documents TO anon;

-- =============================================================================
-- CLAIMS VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW claims.org_ids AS
SELECT user_id, org_id FROM public.org_members;

CREATE OR REPLACE VIEW claims.org_roles AS
SELECT user_id, org_id, role FROM public.org_members;

GRANT SELECT ON claims.org_ids TO anon, authenticated, service_role;
GRANT SELECT ON claims.org_roles TO anon, authenticated, service_role;

-- =============================================================================
-- DEFINE RULES
-- =============================================================================

-- Organizations: members can view
SELECT auth.rule('organizations',
  auth.select('id', 'name', 'created_at'),
  auth.eq('id', auth.one_of('org_ids'))
);

-- Documents: public OR org member can view
SELECT auth.rule('documents',
  auth.select('id', 'org_id', 'title', 'is_public', 'created_by', 'created_at'),
  auth.or_(
    auth.eq('is_public', true),
    auth.eq('org_id', auth.one_of('org_ids'))
  )
);

-- Documents: insert (org members only)
SELECT auth.rule('documents',
  auth.insert(),
  auth.eq('org_id', auth.one_of('org_ids')),
  auth.eq('created_by', auth.user_id_marker())
);

-- Documents: update (creator only)
SELECT auth.rule('documents',
  auth.update(),
  auth.eq('created_by', auth.user_id_marker())
);

-- Documents: delete (creator only)
SELECT auth.rule('documents',
  auth.delete(),
  auth.eq('created_by', auth.user_id_marker())
);

-- =============================================================================
-- SAMPLE DATA
-- =============================================================================

INSERT INTO public.organizations (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp'),
  ('22222222-2222-2222-2222-222222222222', 'Globex Inc')
ON CONFLICT DO NOTHING;

-- Note: user_ids would normally come from auth.users
-- For testing, we use placeholder UUIDs
INSERT INTO public.org_members (org_id, user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member'),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'viewer')
ON CONFLICT DO NOTHING;

INSERT INTO public.documents (org_id, title, content, is_public, created_by) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Internal Doc', 'Secret stuff', false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('11111111-1111-1111-1111-111111111111', 'Acme Public Doc', 'Public info', true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'Globex Doc', 'Globex content', false, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT DO NOTHING;
