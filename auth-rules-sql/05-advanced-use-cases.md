# Advanced Use Cases

Complex authorization patterns: hierarchical access, time-based rules, multi-tenant sharing.

---

## Hierarchical Role-Based Access

**Scenario**: Different roles see different data within the same org.

- `admin` → All documents in their orgs
- `member` → Only documents they created
- `viewer` → Only public documents

**Claims view:**

```sql
CREATE VIEW claims.org_roles AS
SELECT user_id, org_id, role
FROM public.org_members;
```

**Rule with complex conditions:**

```sql
SELECT auth.rule('documents',
  auth.select('id', 'org_id', 'title', 'is_public', 'created_by'),
  auth.or(
    -- Admins see everything in their orgs
    auth.in('org_id', 'org_ids', auth.check('org_roles', 'role', ARRAY['admin'])),
    -- Members see their own documents
    auth.and(
      auth.in('org_id', 'org_ids', auth.check('org_roles', 'role', ARRAY['member'])),
      auth.eq('created_by', auth.user_id())
    ),
    -- Viewers see only public documents
    auth.and(
      auth.in('org_id', 'org_ids', auth.check('org_roles', 'role', ARRAY['viewer'])),
      auth.eq('is_public', true)
    )
  )
);
```

**Generated view:**

```sql
CREATE VIEW api.documents AS
SELECT id, org_id, title, is_public, created_by
FROM public.documents d
JOIN claims.org_roles c ON c.org_id = d.org_id AND c.user_id = auth.uid()
WHERE
  c.role = 'admin'
  OR (c.role = 'member' AND d.created_by = auth.uid())
  OR (c.role = 'viewer' AND d.is_public = TRUE);
```

---

## Hierarchical Teams (Recursive)

**Scenario**: User in parent team gets access to child team resources.

```
Engineering (user is member)
├── Frontend Team (inherits)
│   └── React Squad (inherits)
└── Backend Team (inherits)
```

**Claims view with recursive CTE:**

```sql
CREATE VIEW claims.accessible_team_ids AS
WITH RECURSIVE team_tree AS (
  -- Direct membership
  SELECT user_id, team_id
  FROM public.team_members

  UNION

  -- Child teams
  SELECT tt.user_id, t.id AS team_id
  FROM team_tree tt
  JOIN public.teams t ON t.parent_team_id = tt.team_id
)
SELECT DISTINCT user_id, team_id FROM team_tree;
```

**Rule:**

```sql
SELECT auth.rule('team_resources',
  auth.select('id', 'team_id', 'name'),
  auth.eq('team_id', auth.one_of('accessible_team_ids'))
);
```

**Generated view:**

```sql
CREATE VIEW api.team_resources AS
SELECT id, team_id, name
FROM public.team_resources
WHERE team_id IN (
  SELECT team_id FROM claims.accessible_team_ids
  WHERE user_id = auth.uid()
);
```

---

## Time-Based Access

**Scenario**: Course access only during enrollment period.

**Claims view with time filter:**

```sql
CREATE VIEW claims.active_course_ids AS
SELECT user_id, course_id
FROM public.enrollments
WHERE starts_at <= now() AND ends_at >= now();
```

**Rule:**

```sql
SELECT auth.rule('course_content',
  auth.select('id', 'course_id', 'title', 'content'),
  auth.eq('course_id', auth.one_of('active_course_ids'))
);
```

**Generated view:**

```sql
CREATE VIEW api.course_content AS
SELECT id, course_id, title, content
FROM public.course_content
WHERE course_id IN (
  SELECT course_id FROM claims.active_course_ids
  WHERE user_id = auth.uid()
);
```

The `now()` in the claims view is evaluated at query time. Enrollment expires automatically.

---

## Multi-Tenant Resource Sharing

**Scenario**: Tenant A shares specific resources with Tenant B.

**Claims views:**

```sql
-- User's tenants
CREATE VIEW claims.tenant_ids AS
SELECT user_id, tenant_id
FROM public.tenant_users;

-- Shared resources
CREATE VIEW claims.shared_resource_ids AS
SELECT tu.user_id, rs.resource_id
FROM public.tenant_users tu
JOIN public.resource_shares rs ON rs.shared_with_tenant_id = tu.tenant_id;
```

**Rule (own + shared):**

```sql
SELECT auth.rule('resources',
  auth.select('id', 'tenant_id', 'name'),
  auth.or(
    auth.eq('tenant_id', auth.one_of('tenant_ids')),
    auth.eq('id', auth.one_of('shared_resource_ids'))
  )
);
```

**Generated view:**

```sql
CREATE VIEW api.resources AS
SELECT id, tenant_id, name
FROM public.resources
WHERE
  tenant_id IN (SELECT tenant_id FROM claims.tenant_ids WHERE user_id = auth.uid())
  OR
  id IN (SELECT resource_id FROM claims.shared_resource_ids WHERE user_id = auth.uid());
```

---

## Slack-Like Channels

**Scenario**: Workspaces with public and private channels.

**Claims views:**

```sql
-- Workspace membership
CREATE VIEW claims.workspace_ids AS
SELECT user_id, workspace_id
FROM public.workspace_members;

-- Private channel membership
CREATE VIEW claims.private_channel_ids AS
SELECT cm.user_id, cm.channel_id
FROM public.channel_members cm
JOIN public.channels c ON c.id = cm.channel_id
WHERE c.is_private = TRUE;
```

**Rule for channels:**

```sql
SELECT auth.rule('channels',
  auth.select('id', 'workspace_id', 'name', 'is_private'),
  auth.and(
    auth.eq('workspace_id', auth.one_of('workspace_ids')),
    auth.or(
      auth.eq('is_private', false),
      auth.eq('id', auth.one_of('private_channel_ids'))
    )
  )
);
```

**Generated view:**

```sql
CREATE VIEW api.channels AS
SELECT id, workspace_id, name, is_private
FROM public.channels
WHERE
  workspace_id IN (SELECT workspace_id FROM claims.workspace_ids WHERE user_id = auth.uid())
  AND (
    is_private = FALSE
    OR id IN (SELECT channel_id FROM claims.private_channel_ids WHERE user_id = auth.uid())
  );
```

**Rule for messages:**

```sql
SELECT auth.rule('messages',
  auth.select('id', 'channel_id', 'user_id', 'content', 'created_at'),
  auth.eq('channel_id', auth.one_of('accessible_channel_ids'))
);
```

Where `accessible_channel_ids` is derived from the channels logic.

---

## Nested Folder Sharing

**Scenario**: Shared folder grants access to all subfolders.

**Recursive claims view:**

```sql
CREATE VIEW claims.accessible_folder_ids AS
WITH RECURSIVE folder_tree AS (
  -- Directly shared
  SELECT user_id, folder_id
  FROM public.folder_shares

  UNION

  -- Child folders inherit
  SELECT ft.user_id, f.id AS folder_id
  FROM folder_tree ft
  JOIN public.folders f ON f.parent_folder_id = ft.folder_id
)
SELECT DISTINCT user_id, folder_id FROM folder_tree;
```

**Rule for folders:**

```sql
SELECT auth.rule('folders',
  auth.select('id', 'parent_folder_id', 'name'),
  auth.eq('id', auth.one_of('accessible_folder_ids'))
);
```

**Rule for files:**

```sql
SELECT auth.rule('files',
  auth.select('id', 'folder_id', 'name'),
  auth.eq('folder_id', auth.one_of('accessible_folder_ids'))
);
```

---

## Pattern Summary

| Scenario            | Claims View Pattern | Rule Pattern                         |
| ------------------- | ------------------- | ------------------------------------ |
| Direct membership   | Simple SELECT       | `auth.one_of('claim')`               |
| Role-based          | Include role column | `auth.check('claim', 'role', [...])` |
| Hierarchical        | Recursive CTE       | `auth.one_of('recursive_claim')`     |
| Time-based          | WHERE with now()    | `auth.one_of('time_filtered_claim')` |
| Multi-source access | UNION or OR         | `auth.or(...)`                       |
| Conditional logic   | JOIN conditions     | `auth.and(...)`, `auth.or(...)`      |

---

## Next: System SQL

For complete setup including auth functions, see [System SQL](./06-system-sql.md).
