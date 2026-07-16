import React, { useState, useRef } from "react";
import JSZip from "jszip";
import {
  Upload,
  FileCode,
  File,
  CheckSquare,
  Square,
  Search,
  Plus,
  Trash2,
  FileEdit,
  Save,
  Check,
  X,
  FileImage,
  FolderOpen,
  FolderClosed,
  AlertCircle
} from "lucide-react";
import { StagedFile } from "../types";

interface FileBrowserProps {
  files: StagedFile[];
  onFilesChange: (files: StagedFile[]) => void;
}

function isFileBinary(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const textExtensions = [
    "txt", "md", "js", "jsx", "ts", "tsx", "json", "css", "html", "xml",
    "yml", "yaml", "ini", "cfg", "sh", "py", "java", "cpp", "c", "h",
    "cs", "php", "go", "rb", "rs", "sql", "svg", "properties", "env", "example", "gitignore"
  ];
  return !textExtensions.includes(ext);
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Utility to find common prefix directory from a list of relative paths inside a ZIP file
function findCommonDirectoryPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const splitPaths = paths.map((p) => p.split("/"));
  // Find the minimum directory segments length (ignoring the file name itself, which is the last element)
  const minDirLength = Math.min(...splitPaths.map((sp) => sp.length - 1));
  if (minDirLength <= 0) return "";

  const commonSegments: string[] = [];
  for (let i = 0; i < minDirLength; i++) {
    const segment = splitPaths[0][i];
    const allMatch = splitPaths.every((sp) => sp[i] === segment);
    if (allMatch) {
      commonSegments.push(segment);
    } else {
      break;
    }
  }

  if (commonSegments.length === 0) return "";
  return commonSegments.join("/") + "/";
}

// Utility to recursively traverse dropped directories
function traverseFileTree(entry: any, path: string = ""): Promise<File[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (file: File) => {
          const fullPath = path + file.name;
          try {
            Object.defineProperty(file, "webkitRelativePath", {
              value: fullPath,
              writable: true,
              configurable: true,
            });
          } catch (e) {
            (file as any).customRelativePath = fullPath;
          }
          resolve([file]);
        },
        () => resolve([])
      );
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readAllEntries = (): Promise<any[]> => {
        return new Promise((resolveEntries) => {
          const allEntries: any[] = [];
          const readEntries = () => {
            dirReader.readEntries(
              (entries: any[]) => {
                if (entries.length === 0) {
                  resolveEntries(allEntries);
                } else {
                  allEntries.push(...entries);
                  readEntries();
                }
              },
              () => resolveEntries(allEntries)
            );
          };
          readEntries();
        });
      };

      readAllEntries().then((entries) => {
        const promises = entries.map((e) => traverseFileTree(e, path + entry.name + "/"));
        Promise.all(promises).then((fileArrays) => {
          resolve(fileArrays.flat());
        });
      });
    } else {
      resolve([]);
    }
  });
}

export default function FileBrowser({ files, onFilesChange }: FileBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [tempPathValue, setTempPathValue] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [showNewFileForm, setShowNewFileForm] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoStripPrefix, setAutoStripPrefix] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const selectedFile = files.find((f) => f.path === selectedFilePath);

  // Read file contents as text helper
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  // Read file contents as Base64 helper (for binaries)
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle incoming Files (either via file selector, folder selector, or drag & drop)
  const processFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    setErrorMsg(null);
    const updatedFiles = [...files];

    // Intermediate list to accumulate files to add/overwrite
    const newFilesToInsert: Array<{
      originalPath: string;
      content: string;
      isBinary: boolean;
      size: number;
    }> = [];

    const fileArray = Array.isArray(fileList) ? fileList : Array.from(fileList);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i] as any; // Cast as any to access webkitRelativePath safely

      // If file is a ZIP, extract it!
      if (file.name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir) {
              const isBinary = isFileBinary(relativePath);
              let content = "";
              if (isBinary) {
                content = await zipEntry.async("base64");
              } else {
                content = await zipEntry.async("string");
              }

              newFilesToInsert.push({
                originalPath: relativePath,
                content,
                isBinary,
                size: (zipEntry as any)._data?.uncompressedSize || content.length,
              });
            }
          }
        } catch (err: any) {
          setErrorMsg(`Failed to extract zip file "${file.name}": ${err.message}`);
        }
      } else {
        // Individual standard file or file from a folder upload
        try {
          const isBinary = isFileBinary(file.name);
          let content = "";
          if (isBinary) {
            content = await readFileAsBase64(file);
          } else {
            content = await readFileAsText(file);
          }

          // If uploaded via folder selection or drag/drop, custom/webkitRelativePath will have the path
          const relativePath = file.customRelativePath || file.webkitRelativePath || file.name;

          newFilesToInsert.push({
            originalPath: relativePath,
            content,
            isBinary,
            size: file.size,
          });
        } catch (err: any) {
          setErrorMsg(`Failed to read file "${file.name}": ${err.message}`);
        }
      }
    }

    // Find common directory prefix among newly processed files
    const paths = newFilesToInsert.map((f) => f.originalPath);
    const commonPrefix = autoStripPrefix ? findCommonDirectoryPrefix(paths) : "";

    for (const fileToInsert of newFilesToInsert) {
      const cleanedPath = (commonPrefix && fileToInsert.originalPath.startsWith(commonPrefix))
        ? fileToInsert.originalPath.substring(commonPrefix.length)
        : fileToInsert.originalPath;

      // Check if file already exists in our transfer list
      const existingIndex = updatedFiles.findIndex((f) => f.path === cleanedPath);
      const stagedFile: StagedFile = {
        path: cleanedPath,
        content: fileToInsert.content,
        isBinary: fileToInsert.isBinary,
        size: fileToInsert.size,
        staged: true,
      };

      if (existingIndex > -1) {
        updatedFiles[existingIndex] = stagedFile;
      } else {
        updatedFiles.push(stagedFile);
      }
    }

    onFilesChange(updatedFiles);
    if (updatedFiles.length > 0 && !selectedFilePath) {
      setSelectedFilePath(updatedFiles[0].path);
      setEditingContent(updatedFiles[0].content);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const filesToProcess: File[] = [];
      const entryPromises: Promise<File[]>[] = [];

      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entryPromises.push(traverseFileTree(entry, ""));
          } else {
            const file = item.getAsFile();
            if (file) filesToProcess.push(file);
          }
        }
      }

      if (entryPromises.length > 0) {
        try {
          const results = await Promise.all(entryPromises);
          const traversedFiles = results.flat();
          filesToProcess.push(...traversedFiles);
        } catch (err: any) {
          setErrorMsg(`Failed to process dropped folder items: ${err.message}`);
        }
      }

      if (filesToProcess.length > 0) {
        await processFiles(filesToProcess);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  // Toggle stage/unstage for individual file
  const toggleStage = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onFilesChange(
      files.map((f) => (f.path === path ? { ...f, staged: !f.staged } : f))
    );
  };

  // Toggle stage all
  const toggleStageAll = (stage: boolean) => {
    onFilesChange(files.map((f) => ({ ...f, staged: stage })));
  };

  // Delete a file from staging
  const deleteFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = files.filter((f) => f.path !== path);
    onFilesChange(filtered);
    if (selectedFilePath === path) {
      if (filtered.length > 0) {
        setSelectedFilePath(filtered[0].path);
        setEditingContent(filtered[0].content);
      } else {
        setSelectedFilePath(null);
        setEditingContent("");
      }
    }
  };

  // Select a file to view/edit
  const selectFile = (file: StagedFile) => {
    setSelectedFilePath(file.path);
    setEditingContent(file.content);
    setEditingPath(null);
  };

  // Save the edited content of the file
  const saveContent = () => {
    if (!selectedFilePath) return;
    onFilesChange(
      files.map((f) => (f.path === selectedFilePath ? { ...f, content: editingContent, size: editingContent.length } : f))
    );
  };

  // Trigger Rename Mode
  const startRename = (file: StagedFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPath(file.path);
    setTempPathValue(file.path);
  };

  // Commit file Rename
  const saveRename = (oldPath: string) => {
    const trimmed = tempPathValue.trim();
    if (!trimmed) {
      setEditingPath(null);
      return;
    }

    if (files.some((f) => f.path === trimmed && f.path !== oldPath)) {
      setErrorMsg("A file with that path already exists.");
      setEditingPath(null);
      return;
    }

    onFilesChange(
      files.map((f) => (f.path === oldPath ? { ...f, path: trimmed } : f))
    );

    if (selectedFilePath === oldPath) {
      setSelectedFilePath(trimmed);
    }

    setEditingPath(null);
  };

  // Create new empty text file
  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) return;

    if (files.some((f) => f.path === trimmed)) {
      setErrorMsg("A file with that path already exists.");
      return;
    }

    const newFile: StagedFile = {
      path: trimmed,
      content: "",
      isBinary: isFileBinary(trimmed),
      size: 0,
      staged: true,
    };

    onFilesChange([...files, newFile]);
    setSelectedFilePath(trimmed);
    setEditingContent("");
    setNewFileName("");
    setShowNewFileForm(false);
  };

  // Filter files by search query
  const filteredFiles = files.filter((f) =>
    f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
      {/* File management pane (Left, 5 cols) */}
      <div className="lg:col-span-5 flex flex-col h-[520px] border-r border-slate-800 pr-0 lg:pr-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-400" />
            Workspace Files ({files.length})
          </h3>

          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <div className="flex gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => toggleStageAll(true)}
                  className="px-2 py-1 bg-slate-850 hover:bg-slate-750 text-slate-300 rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Stage All
                </button>
                <button
                  type="button"
                  onClick={() => toggleStageAll(false)}
                  className="px-2 py-1 bg-slate-850 hover:bg-slate-750 text-slate-300 rounded border border-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Unstage
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowNewFileForm(!showNewFileForm)}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer"
              title="Add blank file"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-3 flex items-start gap-2 p-2 bg-red-950/40 border border-red-900/60 text-red-300 rounded text-xs animate-fadeIn">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Drag & Drop Upload Zone */}
        <div
          id="drop-zone"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-lg text-center cursor-pointer mb-3 transition-all duration-200 ${
            dragActive
              ? "border-blue-500 bg-blue-950/20 text-blue-300"
              : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/70 text-slate-400"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
            accept=".zip,image/*,text/*,application/javascript,application/json,application/x-typescript"
          />
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderChange}
            {...{ webkitdirectory: "", directory: "" }}
            multiple
            className="hidden"
          />
          <Upload className={`w-8 h-8 mb-2 transition-transform duration-200 ${dragActive ? "scale-110 text-blue-400" : "text-slate-500"}`} />
          <p className="text-xs font-semibold text-slate-300 mb-2">
            Drag & Drop Files, ZIPs, or Folders here
          </p>
          <div className="flex gap-2 mb-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow transition-colors cursor-pointer animate-fadeIn"
            >
              Upload Files / ZIP
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-xs font-semibold shadow transition-colors cursor-pointer animate-fadeIn"
            >
              Upload Folder
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 leading-normal">
            Extracts ZIPs & preserves folder directory structure on upload.
          </p>
        </div>

        {/* Auto Strip Common Root Directory Toggle */}
        <div className="flex items-start gap-2.5 px-2 py-2 bg-slate-950/50 border border-slate-850 rounded-lg mb-4 select-none">
          <input
            type="checkbox"
            id="auto-strip-prefix-checkbox"
            checked={autoStripPrefix}
            onChange={(e) => setAutoStripPrefix(e.target.checked)}
            className="rounded border-slate-800 bg-slate-950 text-blue-500 focus:ring-blue-500 h-4 w-4 cursor-pointer accent-blue-500 mt-0.5"
          />
          <label htmlFor="auto-strip-prefix-checkbox" className="text-xs font-medium text-slate-300 cursor-pointer hover:text-slate-200 leading-tight">
            Auto-strip common wrapping root folder
            <span className="text-[10px] text-slate-500 font-mono block mt-1 leading-normal">
              Strips the common top-level directory prefix from extracted ZIP items or uploaded folders (e.g. mapping <code className="text-blue-400">MyProject/gradlew</code> directly to <code className="text-blue-400">gradlew</code> at root). This ensures workspace files compile seamlessly.
            </span>
          </label>
        </div>

        {/* New File Form */}
        {showNewFileForm && (
          <form onSubmit={handleCreateFile} className="mb-4 p-3 bg-slate-850 border border-slate-800 rounded-lg animate-fadeIn flex gap-2">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="src/components/MyNewFile.ts"
              className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-750 rounded text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent placeholder-slate-600"
              required
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewFileForm(false);
                setNewFileName("");
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Search bar */}
        <div className="relative mb-3 flex-shrink-0">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workspace files..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-600"
          />
        </div>

        {/* File Tree List */}
        <div id="file-list-container" className="flex-1 overflow-y-auto space-y-1 pr-1 border border-slate-800 bg-slate-950/20 rounded-lg p-2">
          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600">
              <File className="w-10 h-10 mb-2 stroke-[1.5]" />
              <p className="text-xs">No files uploaded yet.</p>
            </div>
          ) : (
            filteredFiles.map((file) => {
              const isSelected = file.path === selectedFilePath;
              const isRenaming = file.path === editingPath;

              return (
                <div
                  key={file.path}
                  id={`file-item-${file.path.replace(/[^a-zA-Z0-9]/g, "-")}`}
                  onClick={() => selectFile(file)}
                  className={`group flex items-center justify-between p-2 rounded-md text-xs transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-800/80 text-slate-100 border border-slate-700"
                      : "hover:bg-slate-850/60 text-slate-300 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      id={`checkbox-${file.path.replace(/[^a-zA-Z0-9]/g, "-")}`}
                      onClick={(e) => toggleStage(file.path, e)}
                      className="text-slate-500 hover:text-blue-400 transition-colors p-0.5 rounded cursor-pointer"
                      title={file.staged ? "Click to unstage file" : "Click to stage file"}
                    >
                      {file.staged ? (
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600" />
                      )}
                    </button>

                    {file.isBinary ? (
                      file.path.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i) ? (
                        <FileImage className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )
                    ) : (
                      <FileCode className="w-4 h-4 text-sky-400 flex-shrink-0" />
                    )}

                    {isRenaming ? (
                      <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={tempPathValue}
                          onChange={(e) => setTempPathValue(e.target.value)}
                          className="flex-1 px-1.5 py-0.5 bg-slate-900 border border-blue-500 rounded text-slate-100 text-xs focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(file.path);
                            if (e.key === "Escape") setEditingPath(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => saveRename(file.path)}
                          className="p-1 text-emerald-400 hover:text-emerald-300 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPath(null)}
                          className="p-1 text-slate-400 hover:text-slate-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="truncate font-mono font-medium leading-none" title={file.path}>
                        {file.path}
                      </span>
                    )}
                  </div>

                  {!isRenaming && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <button
                        type="button"
                        onClick={(e) => startRename(file, e)}
                        className="p-1 hover:bg-slate-700 hover:text-slate-200 text-slate-500 rounded"
                        title="Rename file / change directory"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        id={`delete-${file.path.replace(/[^a-zA-Z0-9]/g, "-")}`}
                        onClick={(e) => deleteFile(file.path, e)}
                        className="p-1 hover:bg-slate-700 hover:text-red-400 text-slate-500 rounded"
                        title="Delete file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 ml-1.5 select-none leading-none">
                    {formatBytes(file.size, 0)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Inline Viewer/Editor (Right, 7 cols) */}
      <div className="lg:col-span-7 flex flex-col h-[520px]">
        {selectedFile ? (
          <div className="flex flex-col h-full border border-slate-800 rounded-lg overflow-hidden bg-slate-950/30">
            {/* Header banner */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <span className="text-xs font-mono font-bold text-slate-200 truncate" title={selectedFile.path}>
                  {selectedFile.path}
                </span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-medium uppercase font-mono">
                  {selectedFile.isBinary ? "Binary" : "Text"}
                </span>
                {selectedFile.staged ? (
                  <span className="text-[10px] bg-blue-950 text-blue-400 px-1.5 py-0.5 rounded font-semibold font-mono border border-blue-900/60">
                    Staged
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                    Unstaged
                  </span>
                )}
              </div>

              {!selectedFile.isBinary && (
                <button
                  type="button"
                  id="save-file-btn"
                  onClick={saveContent}
                  disabled={selectedFile.content === editingContent}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    selectedFile.content === editingContent
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-sm cursor-pointer"
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </button>
              )}
            </div>

            {/* Contents View */}
            <div className="flex-1 overflow-auto bg-slate-950 font-mono text-xs">
              {selectedFile.isBinary ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
                  {selectedFile.path.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i) ? (
                    <div className="space-y-4">
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg inline-block shadow-inner max-w-xs overflow-hidden max-h-[220px]">
                        <img
                          src={`data:image/${selectedFile.path.split(".").pop()};base64,${selectedFile.content}`}
                          alt={selectedFile.path}
                          className="max-w-full max-h-[190px] object-contain rounded"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <p className="text-slate-400 font-semibold">{selectedFile.path}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <File className="w-12 h-12 mx-auto text-amber-500 stroke-[1.5]" />
                      <p className="font-semibold text-slate-300">Binary File Object</p>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 mt-2 max-w-sm leading-normal">
                    This file contains binary data and cannot be edited directly inside the browser. It will be committed securely as a base64 encoded Git blob object.
                  </p>
                  <div className="mt-4 text-xs text-slate-400 font-mono px-3 py-1 bg-slate-900 border border-slate-800 rounded">
                    File Size: {formatBytes(selectedFile.size)}
                  </div>
                </div>
              ) : (
                <div className="flex h-full">
                  {/* Line numbers indicator */}
                  <div className="py-4 bg-slate-950 border-r border-slate-900 text-slate-650 text-right select-none w-10 px-2 leading-relaxed">
                    {Array.from({ length: Math.max(1, editingContent.split("\n").length) }).map((_, idx) => (
                      <div key={idx}>{idx + 1}</div>
                    ))}
                  </div>
                  {/* Text Editor */}
                  <textarea
                    id="code-editor-textarea"
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    placeholder="Enter file contents here..."
                    className="w-full h-full p-4 bg-transparent text-slate-200 leading-relaxed font-mono text-xs focus:outline-none resize-none overflow-y-auto"
                    spellCheck="false"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full border border-slate-800 border-dashed rounded-lg bg-slate-950/20 text-slate-500">
            <FolderClosed className="w-12 h-12 mb-3 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-400">No file selected</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs text-center leading-normal">
              Upload a ZIP archive or standard files, then select any file from the workspace list to view or edit its contents.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
