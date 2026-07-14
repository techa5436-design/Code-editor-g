import React, { useState, useEffect } from "react";
import {
  Github,
  FolderSync,
  Compass,
  FileCode,
  CheckCircle,
  HelpCircle,
  Code2,
  Info,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import GitHubConnector from "./components/GitHubConnector";
import FileBrowser from "./components/FileBrowser";
import CommitPanel from "./components/CommitPanel";
import { StagedFile } from "./types";

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("github_transfer_token");
  });
  const [authMethod, setAuthMethod] = useState<"oauth" | "pat" | null>(() => {
    return localStorage.getItem("github_transfer_auth_method") as "oauth" | "pat" | null;
  });

  const [files, setFiles] = useState<StagedFile[]>([]);
  const [showDocs, setShowDocs] = useState(false);

  // Synchronize token state with localStorage
  const handleConnect = (newToken: string, method: "oauth" | "pat") => {
    setToken(newToken);
    setAuthMethod(method);
    localStorage.setItem("github_transfer_token", newToken);
    localStorage.setItem("github_transfer_auth_method", method);
  };

  const handleDisconnect = () => {
    setToken(null);
    setAuthMethod(null);
    localStorage.removeItem("github_transfer_token");
    localStorage.removeItem("github_transfer_auth_method");
  };

  // Pre-populate some starter template files if workspace is completely empty
  useEffect(() => {
    if (files.length === 0) {
      setFiles([
        {
          path: "README.md",
          content: `# GitHub File Transfer Workspace\n\nWelcome to your dynamic cloud workspace. This sandbox lets you manage individual files or unpack a ZIP archive, inspect and edit files inline, and commit changes straight to any GitHub repository.\n\n### How to get started:\n1. Connect your profile using either a standard **GitHub Sign-In** or a **Personal Access Token (PAT)**.\n2. Upload custom code or drop a \`.zip\` file in the drag-and-drop file panel below.\n3. Make inline edits, select which files to include, choose your destination repository, and hit **Transfer & Commit**!\n`,
          isBinary: false,
          size: 588,
          staged: true,
        },
        {
          path: ".gitignore",
          content: `# System / IDE files\n.DS_Store\nThumbs.db\n.idea/\n.vscode/\n\n# Dependencies and builds\nnode_modules/\ndist/\nbuild/\n.env\n`,
          isBinary: false,
          size: 114,
          staged: true,
        }
      ]);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#080b13] text-slate-100 flex flex-col font-sans">
      {/* Upper Navigation Header */}
      <header id="main-header" className="border-b border-slate-900 bg-[#0c101d]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <FolderSync className="w-5.5 h-5.5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-100">
              GitHub File Transfer Hub
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Dynamic Zip Extraction & Commit Stage Tool
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            id="docs-toggle-btn"
            onClick={() => setShowDocs(!showDocs)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              showDocs
                ? "bg-blue-950/40 border-blue-800/80 text-blue-400"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Setup Guide
          </button>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-850">
            Version 1.0.0
          </span>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Dynamic Setup Instruction Panel (Collapsible) */}
        {showDocs && (
          <div id="docs-panel" className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl animate-scaleIn space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-blue-400 animate-pulse" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">GitHub Connection Guide & Callback Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDocs(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-medium"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-3">
                <span className="font-bold text-slate-100 block text-xs uppercase tracking-wide text-blue-400">Method A: GitHub OAuth Popup</span>
                <p>
                  To use standard <strong>Sign-In with GitHub</strong>, register an OAuth application on your GitHub Developer Portal. Use the following callback details:
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Development Callback URL</span>
                    <code className="text-slate-300 font-mono text-[11px] break-all">
                      https://ais-dev-hvgnulmgh2bdnkj65ffbiv-877336671088.asia-southeast1.run.app/auth/callback
                    </code>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Shared/Deployed Callback URL</span>
                    <code className="text-slate-300 font-mono text-[11px] break-all">
                      https://ais-pre-hvgnulmgh2bdnkj65ffbiv-877336671088.asia-southeast1.run.app/auth/callback
                    </code>
                  </div>
                </div>
                <p className="text-slate-450 text-[11px]">
                  <strong>Required Env Secrets:</strong> Add <code className="text-amber-400">GITHUB_CLIENT_ID</code> and <code className="text-amber-400">GITHUB_CLIENT_SECRET</code> inside your AI Studio Workspace Settings.
                </p>
              </div>

              <div className="space-y-3">
                <span className="font-bold text-slate-100 block text-xs uppercase tracking-wide text-blue-400">Method B: Personal Access Token (PAT)</span>
                <p>
                  For an instant fallback with zero configurations, generate a <strong>Personal Access Token (PAT - Classic)</strong> inside GitHub:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 pl-1">
                  <li>Navigate to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">GitHub Token Settings <ExternalLink className="w-3 h-3" /></a></li>
                  <li>Click <strong>Generate New Token (Classic)</strong></li>
                  <li>Assign the <code className="text-blue-400 font-mono font-bold bg-slate-950 px-1 py-0.5 rounded">repo</code> scope checkbox (Full repo access)</li>
                  <li>Copy and paste your generated token into the <strong>Access Token (PAT)</strong> connection card.</li>
                </ol>
                <div className="p-2.5 bg-blue-950/20 border border-blue-900/40 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
                  <Info className="w-4.5 h-4.5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    This fallback is extremely robust, respects standard GitHub authorization limits, and runs completely in your browser.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Segment: Connection and User Info */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7">
            <GitHubConnector
              token={token}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          </div>
          <div className="md:col-span-5 flex flex-col justify-between p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5 text-blue-400" />
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Workspace Summary</h3>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Stage custom files or extract ZIP archives. Your active repository branch will receive a single clean commit with all selected files!
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-slate-850 pt-4 mt-3">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 text-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Total Files</span>
                <span className="text-lg font-bold text-slate-200 mt-0.5 block">{files.length}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 text-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Staged</span>
                <span className="text-lg font-bold text-blue-400 mt-0.5 block">
                  {files.filter((f) => f.staged).length}
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 text-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Authorization</span>
                <span className="text-xs font-semibold text-slate-300 mt-2.5 block truncate">
                  {token ? (authMethod === "oauth" ? "OAuth Logged" : "PAT Active") : "None"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Segment: Virtual Workspace and Directory Viewer */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider font-sans">1. Virtual Staging Workspace</h2>
            </div>
            {files.length > 0 && (
              <button
                type="button"
                id="clear-workspace-btn"
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear your current workspace files? This does not affect GitHub.")) {
                    setFiles([]);
                  }
                }}
                className="text-[11px] text-slate-500 hover:text-red-400 transition-colors"
              >
                Clear Workspace Files
              </button>
            )}
          </div>
          <FileBrowser files={files} onFilesChange={setFiles} />
        </div>

        {/* Bottom Segment: Commit and Repository Configuration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider font-sans">2. Configure Destination & Commit</h2>
          </div>
          <CommitPanel token={token} files={files} />
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="border-t border-slate-900 bg-[#06080e] py-6 px-6 mt-12 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 GitHub File Transfer & ZIP Extractor. Powered by Gemini & AI Studio.</p>
        <p className="text-[10px] text-slate-650">Secure sandboxed execution environment. All operations respect GitHub REST API standard guidelines.</p>
      </footer>
    </div>
  );
}
