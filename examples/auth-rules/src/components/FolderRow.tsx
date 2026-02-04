"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { VscFolder } from "react-icons/vsc";

type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  owner_id: string;
};

export function FolderRow({
  folder,
  idx,
  onNavigate,
}: {
  folder: Folder;
  idx: number;
  onNavigate: (folderId: string) => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [error, setError] = useState("");

  // Fetch count on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      const [subfolders, files] = await Promise.all([
        supabase
          .from("folders")
          .select("id", { count: "exact", head: true })
          .eq("parent_id", folder.id),
        supabase
          .from("files")
          .select("id", { count: "exact", head: true })
          .eq("folder_id", folder.id),
      ]);

      if (!cancelled) {
        setCount((subfolders.count ?? 0) + (files.count ?? 0));
      }
    }

    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [folder.id]);

  async function handleRename() {
    if (!renameValue.trim() || renameValue === folder.name) {
      setIsRenaming(false);
      setRenameValue(folder.name);
      return;
    }

    const { error } = await supabase
      .from("folders")
      .update({ name: renameValue.trim() })
      .eq("id", folder.id);

    if (error) {
      setError(error.message);
    } else {
      setIsRenaming(false);
    }
  }

  async function handleDelete() {
    const { error } = await supabase
      .from("folders")
      .delete()
      .eq("id", folder.id);

    if (error) {
      setError(error.message);
    }
  }

  return (
    <div
      className={`group flex items-center gap-2 px-4 py-1 cursor-pointer ${idx % 2 === 0 ? "bg-bg-secondary/50" : ""}`}
    >
      <VscFolder className="text-fg-muted shrink-0" />

      {isRenaming ? (
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            else if (e.key === "Escape") {
              setIsRenaming(false);
              setRenameValue(folder.name);
            }
          }}
          onBlur={handleRename}
          autoFocus
          className="flex-1 bg-transparent outline-none border-b border-accent"
        />
      ) : (
        <button
          onClick={() => onNavigate(folder.id)}
          className="flex-1 text-left truncate hover:underline"
        >
          {folder.name}
        </button>
      )}

      <span className="text-fg-muted w-16 text-right inline-flex items-center justify-end">
        {count === null ? (
          <span className="inline-block w-12 h-3 bg-border rounded animate-pulse" />
        ) : (
          `${count} items`
        )}
      </span>

      <span className="invisible group-hover:visible flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsRenaming(true);
          }}
          className="text-fg-muted hover:text-fg"
        >
          rename
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="text-red-500 hover:text-red-400"
        >
          del
        </button>
      </span>

      {error && <span className="text-red-500 text-xs">{error}</span>}
    </div>
  );
}
