-- =============================================================================
-- SEED: Create files and folders for new users (varies per user)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := NEW.id;
  v_folder_id UUID;
  v_subfolder_id UUID;
  v_root_folders TEXT[] := ARRAY['Documents', 'Projects', 'Photos', 'Downloads', 'Archive', 'Work', 'Personal', 'Shared', 'Backups', 'Media'];
  v_subfolders TEXT[] := ARRAY['2024', '2023', '2022', 'Important', 'Draft', 'Final', 'Review', 'Archive', 'New', 'Old'];
  v_file_types TEXT[] := ARRAY['.pdf', '.docx', '.xlsx', '.md', '.txt', '.jpg', '.png', '.zip', '.json', '.csv'];
  v_prefixes TEXT[] := ARRAY['Report', 'Document', 'File', 'Data', 'Notes', 'Meeting', 'Project', 'Draft', 'Final', 'Backup'];
  v_root_notes TEXT[] := ARRAY['Quick Notes.md', 'TODO.md', 'Ideas.md', 'Bookmarks.md', 'scratch.txt', 'README.md', 'Links.md', 'Changelog.md'];
  i INTEGER;
  j INTEGER;
  v_folder_ids UUID[];
  v_all_folder_ids UUID[];
  v_file_count INTEGER := 0;
  v_num_roots INTEGER;
  v_num_subs INTEGER;
  v_num_nested INTEGER;
  v_target_files INTEGER;
  v_size BIGINT;
BEGIN
  -- Vary structure per user: shuffle arrays so each user gets different items
  SELECT array_agg(x ORDER BY random()) INTO v_root_folders FROM unnest(v_root_folders) AS x;
  SELECT array_agg(x ORDER BY random()) INTO v_subfolders FROM unnest(v_subfolders) AS x;
  SELECT array_agg(x ORDER BY random()) INTO v_root_notes FROM unnest(v_root_notes) AS x;

  v_num_roots := 5 + floor(random() * 6)::int;   -- 5-10 root folders
  v_target_files := 6000 + floor(random() * 8000)::int;  -- 6000-14000 files

  -- =========================================================================
  -- CREATE ROOT FOLDERS (random subset, shuffled)
  -- =========================================================================
  FOR i IN 1..v_num_roots LOOP
    INSERT INTO public.folders (owner_id, name)
    VALUES (v_user_id, v_root_folders[i])
    RETURNING id INTO v_folder_id;
    v_folder_ids := array_append(v_folder_ids, v_folder_id);
    v_all_folder_ids := array_append(v_all_folder_ids, v_folder_id);
  END LOOP;

  -- =========================================================================
  -- CREATE SUBFOLDERS (random count per root)
  -- =========================================================================
  FOREACH v_folder_id IN ARRAY v_folder_ids LOOP
    v_num_subs := 3 + floor(random() * 8)::int;  -- 3-10 subfolders per root
    FOR i IN 1..v_num_subs LOOP
      INSERT INTO public.folders (owner_id, parent_id, name)
      VALUES (v_user_id, v_folder_id, v_subfolders[i])
      RETURNING id INTO v_subfolder_id;
      v_all_folder_ids := array_append(v_all_folder_ids, v_subfolder_id);
    END LOOP;
  END LOOP;

  -- =========================================================================
  -- CREATE NESTED SUBFOLDERS (random depth per subfolder)
  -- =========================================================================
  FOR i IN (v_num_roots + 1)..array_length(v_all_folder_ids, 1) LOOP
    v_num_nested := floor(random() * 6)::int;  -- 0-5 nested folders
    FOR j IN 1..v_num_nested LOOP
      INSERT INTO public.folders (owner_id, parent_id, name)
      VALUES (v_user_id, v_all_folder_ids[i], 'Folder ' || j)
      RETURNING id INTO v_subfolder_id;
      v_all_folder_ids := array_append(v_all_folder_ids, v_subfolder_id);
    END LOOP;
  END LOOP;

  -- =========================================================================
  -- CREATE FILES distributed across folders
  -- =========================================================================
  WHILE v_file_count < v_target_files LOOP
    -- Pick a random folder
    v_folder_id := v_all_folder_ids[1 + floor(random() * array_length(v_all_folder_ids, 1))::int];

    -- Generate random size: 70% small (1KB-1MB), 20% medium (1-10MB), 10% large (10-100MB)
    IF random() < 0.7 THEN
      v_size := floor(random() * 1048576) + 1024;  -- 1KB - 1MB
    ELSIF random() < 0.9 THEN
      v_size := floor(random() * 9437184) + 1048576;  -- 1MB - 10MB
    ELSE
      v_size := floor(random() * 94371840) + 10485760;  -- 10MB - 100MB
    END IF;

    -- Insert file with random name
    INSERT INTO public.files (owner_id, folder_id, name, size)
    VALUES (
      v_user_id,
      v_folder_id,
      v_prefixes[1 + floor(random() * array_length(v_prefixes, 1))::int] || '_' ||
        to_char(v_file_count, 'FM00000') ||
        v_file_types[1 + floor(random() * array_length(v_file_types, 1))::int],
      v_size
    );

    v_file_count := v_file_count + 1;
  END LOOP;

  -- =========================================================================
  -- ADD SOME ROOT FILES (random subset)
  -- =========================================================================
  FOR i IN 1..(2 + floor(random() * (array_length(v_root_notes, 1) - 1))::int) LOOP
    INSERT INTO public.files (owner_id, folder_id, name, size)
    VALUES (v_user_id, NULL, v_root_notes[i], floor(random() * 4096) + 256);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_new_user();
