"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { FolderRow } from "@/components/FolderRow";
import { FileRow } from "@/components/FileRow";

type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  owner_id: string;
};

type File = {
  id: string;
  name: string;
  folder_id: string | null;
  content: string | null;
  owner_id: string;
  size: number;
  created_at: string;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    
    let cancelled = false;
    
    // Load contents and breadcrumbs in parallel
    let foldersQuery = supabase
      .from("folders")
      .select("id, name, parent_id, owner_id")
      .order("name");
    let filesQuery = supabase
      .from("files")
      .select("id, name, folder_id, content, owner_id, size, created_at")
      .order("name");

    if (currentFolder) {
      foldersQuery = foldersQuery.eq("parent_id", currentFolder);
      filesQuery = filesQuery.eq("folder_id", currentFolder);
    } else {
      foldersQuery = foldersQuery.is("parent_id", null);
      filesQuery = filesQuery.is("folder_id", null);
    }

    // Wait for both queries before updating state
    Promise.all([foldersQuery, filesQuery]).then(([foldersRes, filesRes]) => {
      if (!cancelled) {
        setFolders(foldersRes.data ?? []);
        setFiles(filesRes.data ?? []);
        setContentLoading(false);
      }
    });
    
    // Breadcrumbs loaded independently
    async function loadBreadcrumbs() {
      const crumbs: Folder[] = [];
      let id = currentFolder;
      while (id) {
        const { data } = await supabase
          .from("folders")
          .select("id, name, parent_id, owner_id")
          .eq("id", id)
          .single();
        if (data) {
          crumbs.unshift(data);
          id = data.parent_id;
        } else break;
      }
      if (!cancelled) setBreadcrumbs(crumbs);
    }
    loadBreadcrumbs();
    
    return () => { cancelled = true; };
  }, [user, currentFolder]);

  useEffect(() => {
    if ((showNewFolderInput || showNewFileInput) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewFolderInput, showNewFileInput]);

  useEffect(() => {
    const handleClick = () => setUserMenuOpen(false);
    if (userMenuOpen) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [userMenuOpen]);

  async function refreshContents() {
    let foldersQuery = supabase
      .from("folders")
      .select("id, name, parent_id, owner_id")
      .order("name");
    let filesQuery = supabase
      .from("files")
      .select("id, name, folder_id, content, owner_id, size, created_at")
      .order("name");

    if (currentFolder) {
      foldersQuery = foldersQuery.eq("parent_id", currentFolder);
      filesQuery = filesQuery.eq("folder_id", currentFolder);
    } else {
      foldersQuery = foldersQuery.is("parent_id", null);
      filesQuery = filesQuery.is("folder_id", null);
    }

    const [foldersRes, filesRes] = await Promise.all([foldersQuery, filesQuery]);
    setFolders(foldersRes.data ?? []);
    setFiles(filesRes.data ?? []);
  }

  async function signIn() {
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
  }

  async function signUp() {
    setError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setCurrentFolder(null);
    setFolders([]);
    setFiles([]);
    setBreadcrumbs([]);
  }

  function navigateTo(folderId: string | null) {
    setContentLoading(true);
    setFolders([]);
    setFiles([]);
    setSelectedFile(null);
    setCurrentFolder(folderId);
  }

  async function createFolder() {
    if (!newItemName.trim() || !user) return;
    const { error } = await supabase.from("folders").insert({
      id: crypto.randomUUID(),
      name: newItemName.trim(),
      parent_id: currentFolder,
      owner_id: user.id,
    });
    if (error) {
      setError(error.message);
    } else {
      setNewItemName("");
      setShowNewFolderInput(false);
      refreshContents();
    }
  }

  async function createFile() {
    if (!newItemName.trim() || !user) return;
    const rand = Math.random();
    const size = rand < 0.7
      ? Math.floor(Math.random() * 1048576) + 1024
      : rand < 0.9
        ? Math.floor(Math.random() * 9437184) + 1048576
        : Math.floor(Math.random() * 94371840) + 10485760;
    const { error } = await supabase.from("files").insert({
      id: crypto.randomUUID(),
      name: newItemName.trim(),
      folder_id: currentFolder,
      owner_id: user.id,
      content: "",
      size,
    });
    if (error) {
      setError(error.message);
    } else {
      setNewItemName("");
      setShowNewFileInput(false);
      refreshContents();
    }
  }

  function openFile(file: File) {
    setSelectedFile(file);
    setFileContent(file.content || "");
    setIsEditing(false);
  }

  async function saveFileContent() {
    if (!selectedFile) return;
    const { error } = await supabase
      .from("files")
      .update({ content: fileContent })
      .eq("id", selectedFile.id);
    if (error) {
      setError(error.message);
    } else {
      setSelectedFile({ ...selectedFile, content: fileContent });
      setIsEditing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-fg-muted">...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-xs space-y-4">
          <h1 className="text-lg font-medium">Sign in</h1>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded outline-none focus:border-fg-muted"
          />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded outline-none focus:border-fg-muted"
          />
          {error && <p className="text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={signIn} className="flex-1 px-3 py-2 bg-accent text-bg rounded hover:opacity-80">
              Sign in
            </button>
            <button onClick={signUp} className="flex-1 px-3 py-2 border border-border rounded hover:bg-bg-secondary">
              Sign up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateTo(null)}
            className="hover:text-fg-muted font-medium"
          >
            Files
          </button>
          {breadcrumbs.map((folder) => (
            <span key={folder.id} className="flex items-center gap-2">
              <span className="text-fg-muted">/</span>
              <button
                onClick={() => navigateTo(folder.id)}
                className="hover:text-fg-muted"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="text-fg-muted hover:text-fg">
            {user.email} ▾
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-bg border border-border rounded shadow-lg py-1 z-50 min-w-[150px]">
              <button
                onClick={() => { signOut(); setUserMenuOpen(false); }}
                className="w-full px-4 py-2 text-left hover:bg-bg-secondary text-red-500"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <button
          onClick={() => { setShowNewFolderInput(true); setShowNewFileInput(false); setNewItemName(""); }}
          className="px-2 py-0.5 bg-bg-secondary border border-border rounded hover:bg-border"
        >
          + New Folder
        </button>
        <button
          onClick={() => { setShowNewFileInput(true); setShowNewFolderInput(false); setNewItemName(""); }}
          className="px-2 py-0.5 bg-bg-secondary border border-border rounded hover:bg-border"
        >
          + New File
        </button>
        {error && <span className="text-red-500 ml-4">{error}</span>}
      </div>

      <div className="flex-1 flex">
        <main className={`flex-1 ${selectedFile ? "border-r border-border" : ""}`}>
          {(showNewFolderInput || showNewFileInput) && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-bg-secondary rounded">
              <span className="text-fg-muted">{showNewFolderInput ? "📁" : "📄"}</span>
              <input
                ref={inputRef}
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (showNewFolderInput) createFolder();
                    else createFile();
                  } else if (e.key === "Escape") {
                    setShowNewFolderInput(false);
                    setShowNewFileInput(false);
                    setNewItemName("");
                  }
                }}
                placeholder={showNewFolderInput ? "Folder name" : "File name"}
                className="flex-1 bg-transparent outline-none"
              />
              <button onClick={() => { if (showNewFolderInput) createFolder(); else createFile(); }} className="text-accent hover:underline">
                Create
              </button>
              <button onClick={() => { setShowNewFolderInput(false); setShowNewFileInput(false); setNewItemName(""); }} className="text-fg-muted hover:text-fg">
                Cancel
              </button>
            </div>
          )}

          {contentLoading ? (
            <div className="animate-pulse">
              {/* Folder-like skeletons */}
              {[35, 50, 25].map((w, i) => (
                <div key={`f${i}`} className={`flex items-center gap-2 px-4 py-1 ${i % 2 === 0 ? "bg-bg-secondary/50" : ""}`}>
                  <div className="w-4 h-4 bg-border rounded" />
                  <div className="flex-1"><div className="h-3 bg-border rounded" style={{ width: `${w}%` }} /></div>
                  <div className="w-16 h-3 bg-border rounded" />
                  <span className="invisible flex items-center gap-1">
                    <span>rename</span>
                    <span>del</span>
                  </span>
                </div>
              ))}
              {/* File-like skeletons */}
              {[45, 60, 30, 55, 40].map((w, i) => (
                <div key={`e${i}`} className={`flex items-center gap-2 px-4 py-1 ${(3 + i) % 2 === 0 ? "bg-bg-secondary/50" : ""}`}>
                  <div className="w-4 h-4 bg-border rounded" />
                  <div className="flex-1"><div className="h-3 bg-border rounded" style={{ width: `${w}%` }} /></div>
                  <div className="w-20 h-3 bg-border rounded" />
                  <div className="w-16 h-3 bg-border rounded" />
                  <span className="invisible flex items-center gap-1">
                    <span>rename</span>
                    <span>del</span>
                  </span>
                </div>
              ))}
            </div>
          ) : folders.length === 0 && files.length === 0 && !showNewFolderInput && !showNewFileInput ? (
            <p className="text-fg-muted p-3 px-4">Empty folder</p>
          ) : (
            <div>
              {folders.map((folder, idx) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  idx={idx}
                  onNavigate={navigateTo}
                />
              ))}
              {files.map((file, idx) => (
                <FileRow
                  key={file.id}
                  file={file}
                  idx={idx}
                  foldersCount={folders.length}
                  isSelected={selectedFile?.id === file.id}
                  onSelect={openFile}
                />
              ))}
            </div>
          )}
        </main>

        {selectedFile && (
          <aside className="w-1/2 max-w-xl flex flex-col">
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
                ) : (
                  <button onClick={() => setIsEditing(true)} className="px-2 py-1 bg-bg-secondary border border-border rounded hover:bg-border">
                    Edit
                  </button>
                )}
                <button onClick={() => setSelectedFile(null)} className="px-2 py-1 text-fg-muted hover:text-fg">
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              {isEditing ? (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full h-full min-h-[300px] bg-bg-secondary border border-border rounded p-3 font-mono outline-none focus:border-fg-muted resize-none"
                  placeholder="Enter file content..."
                />
              ) : (
                <pre className="font-mono whitespace-pre-wrap text-fg-muted">
                  {selectedFile.content || <span className="italic">Empty file</span>}
                </pre>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
