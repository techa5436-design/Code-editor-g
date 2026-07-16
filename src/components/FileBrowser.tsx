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
  AlertCircle,
  Info
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
