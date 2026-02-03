# auth.check()

Filter by claim properties. Require specific roles, tiers, or statuses for access.

---

## The Problem

Basic membership checks answer "Is user in this org?" But sometimes you need "What is user's role in this org?"

- All org members can view documents
- Only admins and owners can view billing

You could create separate claims:

```sql
claims.org_ids          -- all orgs
claims.admin_org_ids    -- orgs where user is admin
claims.owner_org_ids    -- orgs where user is owner
```

Every new role means a new claim. Doesn't scale.

**Better approach**: One claim with roles, filter by role in the rule.

---

## How It Works

**Claims view includes role:**

```sql
CREATE VIEW claims.org_roles AS
SELECT user_id, org_id, role
FROM public.org_members;
```

**Rule uses auth.check():**

```sql
SELECT auth.rule('org_billing',
  auth.select('id', 'org_id', 'plan', 'amount'),
  auth.in('org_id', 'org_ids', auth.check('org_roles', 'role', ARRAY['admin', 'owner']))
);
```

**Generated view:**

```sql
CREATE VIEW api.org_billing AS
SELECT id, org_id, plan, amount
FROM public.org_billing
WHERE org_id IN (
  SELECT org_id FROM claims.org_roles
  WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
);
```

The `auth.check()` adds conditions to the claims subquery.

---

## Syntax

```sql
auth.check('claim_name', 'property', ARRAY['allowed', 'values'])
```

| Argument       | Description                                  |
| -------------- | -------------------------------------------- |
| claim_name     | The claims view to check (e.g., 'org_roles') |
| property       | Column in the claims view (e.g., 'role')     |
| allowed values | Array of acceptable values                   |

---

## Example: Role-Based Access

**User's memberships:**
| org_id | role |
|--------|------|
| org-1 | admin |
| org-2 | viewer |
| org-3 | owner |

**Rule requires admin/owner:**

```sql
auth.check('org_roles', 'role', ARRAY['admin', 'owner'])
```

**Result:**

- Query for org-1 → sees data (admin ✓)
- Query for org-2 → no data (viewer ✗)
- Query for org-3 → sees data (owner ✓)

---

## Use Cases

### Subscription tier gating

Only pro/enterprise orgs can access analytics.

**Claims view:**

```sql
CREATE VIEW claims.org_plans AS
SELECT om.user_id, o.id AS org_id, o.plan
FROM public.org_members om
JOIN public.organizations o ON o.id = om.org_id;
```

**Rule:**

```sql
SELECT auth.rule('analytics',
  auth.select('id', 'org_id', 'data'),
  auth.in('org_id', 'org_ids', auth.check('org_plans', 'plan', ARRAY['pro', 'enterprise']))
);
```

### Approval workflows

Only deploy approved projects.

**Claims view:**

```sql
CREATE VIEW claims.project_status AS
SELECT pm.user_id, p.id AS project_id, p.status
FROM public.project_members pm
JOIN public.projects p ON p.id = pm.project_id;
```

**Rule:**

```sql
SELECT auth.rule('deployments',
  auth.insert(),
  auth.in('project_id', 'project_ids', auth.check('project_status', 'status', ARRAY['approved']))
);
```

### Document classification

Access based on clearance level.

**Claims view:**

```sql
CREATE VIEW claims.doc_access AS
SELECT user_id, document_id, clearance
FROM public.document_permissions;
```

**Rule:**

```sql
SELECT auth.rule('documents',
  auth.select('id', 'title', 'content'),
  auth.in('id', 'doc_ids', auth.check('doc_access', 'clearance', ARRAY['public', 'internal']))
);
```

---

## Multiple Properties

Check multiple conditions in the same claim:

**Claims view:**

```sql
CREATE VIEW claims.org_membership AS
SELECT user_id, org_id, role, status
FROM public.org_members;
```

**Rule with multiple checks:**

```sql
SELECT auth.rule('org_billing',
  auth.select('id', 'org_id', 'plan'),
  auth.in('org_id', 'org_ids',
    auth.check('org_membership', 'role', ARRAY['admin', 'owner']),
    auth.check('org_membership', 'status', ARRAY['active'])
  )
);
```

**Generated view:**

```sql
WHERE org_id IN (
  SELECT org_id FROM claims.org_membership
  WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
    AND status IN ('active')
)
```

---

## Behavior: Permissive Filtering

Views are inherently permissive. Rows that don't match are filtered out, not rejected.

**User is admin in org-1, viewer in org-2:**

```
GET /org_billing
```

Returns: org-1 billing only. org-2 silently filtered.

This is different from the gateway approach which could reject the entire request. With views, you get back what you have access to.

---

## Performance

Index the claims source table:

```sql
CREATE INDEX idx_org_members_user_role
ON public.org_members(user_id, role);
```

The subquery becomes an efficient index scan.

---

## Next: Advanced Use Cases

For hierarchical access, time-based rules, and multi-tenant sharing, see [Advanced Use Cases](./05-advanced-use-cases.md).
