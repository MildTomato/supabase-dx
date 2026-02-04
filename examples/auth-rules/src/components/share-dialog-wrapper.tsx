"use client";

import { useFileBrowser } from "@/lib/file-browser-context";
import { ShareDialog } from "./share-dialog";

export function ShareDialogWrapper() {
  const { shareTarget, closeShareDialog } = useFileBrowser();

  return (
    <ShareDialog
      open={!!shareTarget}
      onOpenChange={(open) => !open && closeShareDialog()}
      resource={shareTarget?.resource ?? null}
      resourceType={shareTarget?.type ?? "file"}
    />
  );
}
