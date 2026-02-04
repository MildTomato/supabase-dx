"use client";

import { useQueryClient } from "@tanstack/react-query";
import { VscFolder } from "react-icons/vsc";
import type { Folder } from "@/lib/types";
import { useFileBrowser } from "@/lib/file-browser-context";
import {
  useFolderCount,
  folderContentsOptions,
  useRenameFolder,
  useDeleteFolder,
  formatCount,
} from "@/lib/queries";
import { ResourceRow } from "./resource-row";

type FolderRowProps = {
  folder: Folder;
  idx: number;
  isSharedWithMe: boolean;
};

export function FolderRow({ folder, idx, isSharedWithMe }: FolderRowProps) {
  const queryClient = useQueryClient();
  const { navigateTo } = useFileBrowser();
  const { data: count, isPending: countPending } = useFolderCount(folder.id);
  const renameMutation = useRenameFolder();
  const deleteMutation = useDeleteFolder();

  const prefetch = () => {
    queryClient.prefetchInfiniteQuery(folderContentsOptions(folder.id));
  };

  return (
    <ResourceRow
      resource={folder}
      resourceType="folder"
      idx={idx}
      isSharedWithMe={isSharedWithMe}
      icon={<VscFolder className="text-muted-foreground" />}
      metadata={
        <span className="text-muted-foreground w-32 text-right inline-flex items-center justify-end">
          {countPending ? (
            <span className="inline-block w-16 h-3 bg-border rounded animate-pulse" />
          ) : (
            `${formatCount(count ?? 0)} items`
          )}
        </span>
      }
      onClick={() => navigateTo(folder.id, folder)}
      onRename={(name) => renameMutation.mutateAsync({ id: folder.id, name })}
      onDelete={() => deleteMutation.mutateAsync(folder.id)}
      onMouseEnter={prefetch}
    />
  );
}
