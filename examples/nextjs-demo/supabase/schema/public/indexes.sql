-- Indexes for public schema

CREATE INDEX comments_user_id_idx ON comments (user_id);

CREATE INDEX comments_parent_id_idx ON comments (parent_id);

CREATE INDEX comments_created_at_idx ON comments (created_at DESC);

CREATE INDEX comments_post_id_idx ON comments (post_id);

CREATE INDEX posts_slug_idx ON posts (slug);

CREATE INDEX posts_status_idx ON posts (status) WHERE status = 'published'::post_status;

CREATE INDEX posts_published_at_idx ON posts (published_at DESC) WHERE status = 'published'::post_status;

CREATE INDEX posts_created_at_idx ON posts (created_at DESC);

CREATE INDEX posts_user_id_idx ON posts (user_id);

CREATE INDEX profiles_username_idx ON profiles (username);

CREATE INDEX profiles_created_at_idx ON profiles (created_at DESC);

CREATE INDEX profiles_role_idx ON profiles (role);

CREATE INDEX tags_name_idx ON tags (name);

CREATE INDEX tags_slug_idx ON tags (slug);
