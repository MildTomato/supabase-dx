"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Folder, File } from "./types";

type ShareTarget = {
  resource: Folder | File;
  type: "folder" | "file";
} | null;

type FileBrowserContextValue = {
  currentFolder: string | null;
  currentFolderData: Folder | null; // Optimistic folder data for instant breadcrumb display
  navigateTo: (folderId: string | null, folderData?: Folder) => void;
  selectedFile: File | null;
  selectFile: (file: File | null) => void;
  shareTarget: ShareTarget;
  openShareDialog: (resource: Folder | File, type: "folder" | "file") => void;
  closeShareDialog: () => void;
};

const FileBrowserContext = createContext<FileBrowserContextValue | null>(null);

export function FileBrowserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const folderFromUrl = searchParams.get("folder");
  const [currentFolder, setCurrentFolder] = useState<string | null>(folderFromUrl);
  const [currentFolderData, setCurrentFolderData] = useState<Folder | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget>(null);

  // Sync URL to state when URL changes (e.g., browser back/forward)
  useEffect(() => {
    if (folderFromUrl !== currentFolder) {
      setCurrentFolder(folderFromUrl);
      // Clear optimistic data when navigating via URL (back/forward)
      // The breadcrumbs will fetch fresh data
      if (!folderFromUrl) {
        setCurrentFolderData(null);
      }
    }
  }, [folderFromUrl, currentFolder]);

  const navigateTo = useCallback((folderId: string | null, folderData?: Folder) => {
    setSelectedFile(null);
    setCurrentFolder(folderId);
    setCurrentFolderData(folderData ?? null);

    // Update URL
    if (folderId) {
      router.push(`?folder=${folderId}`);
    } else {
      router.push("/");
    }
  }, [router]);

  const selectFile = useCallback((file: File | null) => {
    setSelectedFile(file);
  }, []);

  const openShareDialog = useCallback((resource: Folder | File, type: "folder" | "file") => {
    setShareTarget({ resource, type });
  }, []);

  const closeShareDialog = useCallback(() => {
    setShareTarget(null);
  }, []);

  return (
    <FileBrowserContext.Provider
      value={{
        currentFolder,
        currentFolderData,
        navigateTo,
        selectedFile,
        selectFile,
        shareTarget,
        openShareDialog,
        closeShareDialog,
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
}

export function useFileBrowser() {
  const context = useContext(FileBrowserContext);
  if (!context) {
    throw new Error("useFileBrowser must be used within FileBrowserProvider");
  }
  return context;
}
