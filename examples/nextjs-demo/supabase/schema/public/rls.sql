-- Row Level Security for public schema

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can comment" ON public.comments FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own comments" ON public.comments FOR DELETE USING (((auth.uid() = user_id) OR is_admin_or_mod(auth.uid())));

CREATE POLICY "Users can update their own comments" ON public.comments FOR UPDATE USING ((auth.uid() = user_id));

ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post tags are viewable with posts" ON public.post_tags FOR SELECT USING (true);

CREATE POLICY "Comments on published posts are viewable" ON public.comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM posts
  WHERE ((posts.id = comments.post_id) AND (posts.status = 'published'::post_status)))));

CREATE POLICY "Post owners can manage tags" ON public.post_tags USING ((EXISTS ( SELECT 1
   FROM posts
  WHERE ((posts.id = post_tags.post_id) AND (posts.user_id = auth.uid())))));

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all posts" ON public.posts USING (is_admin_or_mod(auth.uid()));

CREATE POLICY "Published posts are viewable by everyone" ON public.posts FOR SELECT USING (((status = 'published'::post_status) OR (auth.uid() = user_id)));

CREATE POLICY "Users can create posts" ON public.posts FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own posts" ON public.posts FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own posts" ON public.posts FOR UPDATE USING ((auth.uid() = user_id));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tags" ON public.tags USING (is_admin_or_mod(auth.uid()));

CREATE POLICY "Tags are viewable by everyone" ON public.tags FOR SELECT USING (true);
