"use client";

import { useState, useEffect } from "react";
import { useFileBrowser } from "@/lib/file-browser-context";
import { useUpdateFileContent, useMyPermission } from "@/lib/queries";
import { FileComments } from "./file-comments";

export function FilePreview() {
  const { selectedFile, selectFile } = useFileBrowser();
  const [fileContent, setFileContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  const updateFileContentMutation = useUpdateFileContent();
  const { data: permission } = useMyPermission(
    "file",
    selectedFile?.id ?? "",
    selectedFile?.owner_id ?? ""
  );
  const canEdit = permission === "owner" || permission === "edit";
  const canComment = permission === "owner" || permission === "edit" || permission === "comment";

  useEffect(() => {
    if (selectedFile) {
      setFileContent(selectedFile.content || "");
      setIsEditing(false);
    }
  }, [selectedFile]);

  async function saveFileContent() {
    if (!selectedFile) return;
    try {
      await updateFileContentMutation.mutateAsync({
        id: selectedFile.id,
        content: fileContent,
      });
      selectFile({ ...selectedFile, content: fileContent });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    }
  }

  if (!selectedFile) return null;

  return (
    <aside className="w-1/2 max-w-xl flex flex-col border-l border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-medium truncate">{selectedFile.name}</h2>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button onClick={saveFileContent} className="px-2 py-1 bg-accent text-bg rounded hover:opacity-80">
                Save
              </button>
              <button onClick={() => { setFileContent(selectedFile.content || ""); setIsEditing(false); }} className="px-2 py-1 text-fg-muted hover:text-fg">
                Cancel
              </button>
            </>
          ) : canEdit ? (
            <button onClick={() => setIsEditing(true)} className="px-2 py-1 bg-bg-secondary border border-border rounded hover:bg-border">
              Edit
            </button>
          ) : null}
          <button onClick={() => selectFile(null)} className="px-2 py-1 text-fg-muted hover:text-fg">
            Close
          </button>
        </div>
      </div>
      {error && <p className="text-red-500 px-4 py-2">{error}</p>}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 p-4 overflow-auto">
          {isEditing ? (
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="w-full h-full min-h-[200px] bg-bg-secondary border border-border rounded p-3 font-mono outline-none focus:border-fg-muted resize-none"
              placeholder="Enter file content..."
            />
          ) : (
            <pre className="font-mono whitespace-pre-wrap text-fg-muted">
              {selectedFile.content || <span className="italic">Empty file</span>}
            </pre>
          )}
        </div>
        {canComment && <FileComments fileId={selectedFile.id} canComment={canComment} />}
      </div>
    </aside>
  );
}
