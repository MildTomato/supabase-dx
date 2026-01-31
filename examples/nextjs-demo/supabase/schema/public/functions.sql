-- Functions for public schema

CREATE FUNCTION public.generate_post_slug()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug = public.slugify(NEW.title) || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.is_admin_or_mod(user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role IN ('admin', 'moderator')
  );
$function$;

CREATE FUNCTION public.set_published_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'published' AND OLD.status != 'published' THEN
    NEW.published_at = NOW();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.slugify(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT LOWER(REGEXP_REPLACE(REGEXP_REPLACE($1, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
$function$;

CREATE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
