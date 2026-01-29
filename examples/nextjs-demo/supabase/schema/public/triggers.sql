-- Triggers for public schema

CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER posts_generate_slug BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION generate_post_slug();

CREATE TRIGGER posts_set_published_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION set_published_at();

CREATE TRIGGER posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
