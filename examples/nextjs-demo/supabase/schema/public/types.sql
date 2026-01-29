-- Custom types for public schema

CREATE TYPE public.post_status AS ENUM ('draft', 'published', 'archived');

CREATE TYPE public.user_role AS ENUM ('user', 'moderator', 'admin');
