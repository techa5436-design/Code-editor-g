import React, { useState, useEffect } from "react";
import {
  Github,
  GitBranch,
  GitCommit,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Play,
  Settings,
  PlusCircle,
  Clock,
  ArrowRight
} from "lucide-react";
import { GitHubRepo, GitHubBranch, StagedFile, CommitStep } from "../types";

interface CommitPanelProps {
  token: string | null;
  files: StagedFile[];
}

export default function CommitPanel({ token, files }: CommitPanelProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  const [isNewBranch, setIsNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [baseBranchName, setBaseBranchName] = useState("");

  const [commitMessage, setCommitMessage] = useState("Transfer files from GitHub File Transfer App");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);

  const [commitInProgress, setCommitInProgress] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<boolean>(false);
  const [commitResultUrl, setCommitResultUrl] = useState<string | null>(null);

  const [steps, setSteps] = useState<CommitStep[]>([
    { id: "branch", label: "Verify target branch", status: "idle" },
    { id: "blobs", label: "Create Git blob objects", status: "idle" },
    { id: "tree", label: "Create Git file tree structure", status: "idle" },
    { id: "commit", label: "Create new commit reference", status: "idle" },
    { id: "push", label: "Update branch HEAD reference", status: "idle" },
  ]);

  const stagedFiles = files.filter((f) => f.staged);

  // Fetch repositories when connected
  useEffect(() => {
    if (!token) return;

    const fetchRepos = async () => {
      setLoadingRepos(true);
      setCommitError(null);
      try {
        const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load repositories: ${res.statusText}`);
        }

        const data = await res.json();
        setRepos(data);
        if (data.length > 0) {
          setSelectedRepo(data[0].full_name);
        }
      } catch (err: any) {
        setCommitError(err.message || "Failed to load user repositories.");
      } finally {
        setLoadingRepos(false);
      }
    };

    fetchRepos();
  }, [token]);

  // Fetch branches when repository changes
  useEffect(() => {
    if (!token || !selectedRepo) return;

    const fetchBranches = async () => {
      setLoadingBranches(true);
      setCommitError(null);
      try {
        const res = await fetch(`https://api.github.com/repos/${selectedRepo}/branches`, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load branches: ${res.statusText}`);
        }

        const data = await res.json();
        setBranches(data);

        // Find default branch from repos info
        const repoInfo = repos.find((r) => r.full_name === selectedRepo);
        const defaultBranch = repoInfo ? repoInfo.default_branch : "main";

        const hasDefault = data.some((b: any) => b.name === defaultBranch);
        const initialBranch = hasDefault ? defaultBranch : (data[0]?.name || "main");

        setSelectedBranch(initialBranch);
        setBaseBranchName(initialBranch);
      } catch (err: any) {
        setCommitError(err.message || "Failed to load branches for this repository.");
      } finally {
        setLoadingBranches(false);
      }
    };

    fetchBranches();
  }, [token, selectedRepo, repos]);

  // Reset states
  const handleReset = () => {
    setCommitSuccess(false);
    setCommitResultUrl(null);
    setCommitError(null);
    setCommitInProgress(false);
    setSteps([
      { id: "branch", label: "Verify target branch", status: "idle" },
      { id: "blobs", label: "Create Git blob objects", status: "idle" },
      { id: "tree", label: "Create Git file tree structure", status: "idle" },
      { id: "commit", label: "Create new commit reference", status: "idle" },
      { id: "push", label: "Update branch HEAD reference", status: "idle" },
    ]);
  };

  // Run multi-file commit transactions via Git Database API
  const handleCommitAndPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedRepo || stagedFiles.length === 0) return;

    setCommitInProgress(true);
    setCommitError(null);
    setCommitSuccess(false);

    // Initialize all steps to running/idle
    const updateStepStatus = (id: string, status: "idle" | "running" | "success" | "error", details?: string) => {
      setSteps((currentSteps) =>
        currentSteps.map((step) => (step.id === id ? { ...step, status, details } : step))
      );
    };

    const targetBranch = isNewBranch ? newBranchName.trim() : selectedBranch;

    if (!targetBranch) {
      setCommitError("Target branch name is required.");
      setCommitInProgress(false);
      return;
    }

    try {
      const headers = {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      };

      // -------------------------------------------------------------
      // STEP 1: Branch Preparation & Commit Verification
      // -------------------------------------------------------------
      updateStepStatus("branch", "running", `Checking branch "${targetBranch}"...`);

      let latestCommitSha = "";

      if (isNewBranch) {
        // Fetch base branch commit SHA
        const baseRes = await fetch(`https://api.github.com/repos/${selectedRepo}/git/ref/heads/${baseBranchName}`, { headers });
        if (!baseRes.ok) {
          throw new Error(`Failed to find base branch "${baseBranchName}" to fork from.`);
        }
        const baseRefData = await baseRes.json();
        const baseSha = baseRefData.object.sha;

        updateStepStatus("branch", "running", `Creating new branch "${targetBranch}" from "${baseBranchName}"...`);

        // Create the new branch ref
        const createRefRes = await fetch(`https://api.github.com/repos/${selectedRepo}/git/refs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ref: `refs/heads/${targetBranch}`,
            sha: baseSha,
          }),
        });

        if (!createRefRes.ok) {
          const errData = await createRefRes.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to create new branch "${targetBranch}".`);
        }

        latestCommitSha = baseSha;
        updateStepStatus("branch", "success", `Branch "${targetBranch}" successfully created.`);
      } else {
        // Retrieve existing branch head
        const branchRes = await fetch(`https://api.github.com/repos/${selectedRepo}/git/ref/heads/${targetBranch}`, { headers });
        if (!branchRes.ok) {
          throw new Error(`Branch "${targetBranch}" not found or inaccessible.`);
        }
        const refData = await branchRes.json();
        latestCommitSha = refData.object.sha;
        updateStepStatus("branch", "success", `Branch "${targetBranch}" exists. HEAD resolved.`);
      }

      // -------------------------------------------------------------
      // STEP 2: Create Blob Objects
      // -------------------------------------------------------------
      updateStepStatus("blobs", "running", `Staging ${stagedFiles.length} file(s) as blobs...`);

      const treeNodes: Array<{ path: string; mode: string; type: string; sha: string }> = [];

      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        updateStepStatus("blobs", "running", `Creating blob (${i + 1}/${stagedFiles.length}): ${file.path}`);

        const blobResponse = await fetch(`https://api.github.com/repos/${selectedRepo}/git/blobs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            content: file.content,
            encoding: file.isBinary ? "base64" : "utf-8",
          }),
        });

        if (!blobResponse.ok) {
          const errData = await blobResponse.json().catch(() => ({}));
          throw new Error(`Failed to upload ${file.path}: ${errData.message || blobResponse.statusText}`);
        }

        const blobData = await blobResponse.json();
        treeNodes.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        });
      }

      updateStepStatus("blobs", "success", `Successfully created ${stagedFiles.length} blob objects.`);

      // -------------------------------------------------------------
      // STEP 3: Create Git File Tree
      // -------------------------------------------------------------
      updateStepStatus("tree", "running", "Creating new directory tree...");

      // Fetch base commit tree SHA
      const commitRes = await fetch(`https://api.github.com/repos/${selectedRepo}/git/commits/${latestCommitSha}`, { headers });
      if (!commitRes.ok) {
        throw new Error("Failed to load base commit structure.");
      }
      const commitData = await commitRes.json();
      const parentTreeSha = commitData.tree.sha;

      // Post tree changes
      const treeResponse = await fetch(`https://api.github.com/repos/${selectedRepo}/git/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_tree: parentTreeSha,
          tree: treeNodes,
        }),
      });

      if (!treeResponse.ok) {
        const errData = await treeResponse.json().catch(() => ({}));
        throw new Error(`Tree creation failed: ${errData.message || treeResponse.statusText}`);
      }

      const treeData = await treeResponse.json();
      updateStepStatus("tree", "success", `New tree created: ${treeData.sha.substring(0, 7)}`);

      // -------------------------------------------------------------
      // STEP 4: Create Commit Reference
      // -------------------------------------------------------------
      updateStepStatus("commit", "running", "Wrapping changes in commit object...");

      const createCommitRes = await fetch(`https://api.github.com/repos/${selectedRepo}/git/commits`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: commitMessage,
          tree: treeData.sha,
          parents: [latestCommitSha],
        }),
      });

      if (!createCommitRes.ok) {
        const errData = await createCommitRes.json().catch(() => ({}));
        throw new Error(`Commit generation failed: ${errData.message || createCommitRes.statusText}`);
      }

      const newCommitData = await createCommitRes.json();
      updateStepStatus("commit", "success", `Commit created: ${newCommitData.sha.substring(0, 7)}`);

      // -------------------------------------------------------------
      // STEP 5: Push / Update HEAD
      // -------------------------------------------------------------
      updateStepStatus("push", "running", `Pushing commit to refs/heads/${targetBranch}...`);

      const updateRefRes = await fetch(`https://api.github.com/repos/${selectedRepo}/git/refs/heads/${targetBranch}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          sha: newCommitData.sha,
          force: false,
        }),
      });

      if (!updateRefRes.ok) {
        const errData = await updateRefRes.json().catch(() => ({}));
        throw new Error(`HEAD update failed: ${errData.message || updateRefRes.statusText}`);
      }

      updateStepStatus("push", "success", "Branch HEAD updated successfully!");

      // Complete!
      setCommitSuccess(true);
      setCommitResultUrl(`https://github.com/` + selectedRepo + `/commit/` + newCommitData.sha);

      // Refresh branch list to include new branch
      if (isNewBranch) {
        setBranches((b) => [...b, { name: targetBranch, commit: { sha: newCommitData.sha, url: "" } }]);
        setSelectedBranch(targetBranch);
        setIsNewBranch(false);
      }
    } catch (err: any) {
      console.error("Git transfer transaction failed:", err);
      setCommitError(err.message || "An unexpected Git transaction error occurred.");

      // Mark running steps as error
      setSteps((currentSteps) =>
        currentSteps.map((step) => (step.status === "running" ? { ...step, status: "error", details: err.message } : step))
      );
    } finally {
      setCommitInProgress(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-slate-800 border border-slate-700 text-blue-400 rounded-lg">
          <GitCommit className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100 font-sans">Transfer Target & Commit</h2>
          <p className="text-xs text-slate-400">Choose destination repository, branch, and apply commit info</p>
        </div>
      </div>

      {!token ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-lg p-6 bg-slate-950/20">
          <Clock className="w-10 h-10 mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold">GitHub Authorization Required</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs text-center leading-normal">
            Please connect your GitHub profile in the panel above before initiating file transfers.
          </p>
        </div>
      ) : commitSuccess ? (
        <div className="bg-slate-950/40 border border-emerald-900/60 rounded-lg p-6 text-center animate-fadeIn space-y-4">
          <div className="w-12 h-12 bg-emerald-950 border border-emerald-800/80 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle className="w-6 h-6 animate-scaleIn" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-400 text-base">File Transfer Complete!</h3>
            <p className="text-xs text-slate-400 mt-1">Staged workspace files were committed successfully to GitHub.</p>
          </div>

          {commitResultUrl && (
            <a
              href={commitResultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Github className="w-4 h-4" />
              View Commit on GitHub
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-colors cursor-pointer"
            >
              Transfer More Files
            </button>
          </div>
        </div>
      ) : commitInProgress ? (
        /* Committing Progress Tracker Panel */
        <div className="bg-slate-950/30 border border-slate-800 rounded-lg p-6 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm font-semibold text-slate-200">Executing Git Database Transaction...</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">DO NOT CLOSE APP</span>
          </div>

          <div className="space-y-3.5">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  {step.status === "success" ? (
                    <div className="w-4.5 h-4.5 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 text-[10px]">
                      ✓
                    </div>
                  ) : step.status === "running" ? (
                    <Loader2 className="w-4.5 h-4.5 text-blue-500 animate-spin" />
                  ) : step.status === "error" ? (
                    <div className="w-4.5 h-4.5 rounded-full bg-red-950 border border-red-500/50 flex items-center justify-center text-red-400 font-mono text-[10px] font-bold">
                      !
                    </div>
                  ) : (
                    <div className="w-4.5 h-4.5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-[10px]">
                      {idx + 1}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className={`text-xs font-medium leading-tight ${step.status === "success" ? "text-slate-200" : step.status === "running" ? "text-blue-400 font-semibold" : "text-slate-500"}`}>
                    {step.label}
                  </div>
                  {step.details && (
                    <div className="text-[10px] font-mono text-slate-400 mt-1 pl-1 border-l border-slate-850 whitespace-pre-wrap leading-normal">
                      {step.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {commitError && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4.5 h-4.5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-slate-200 block mb-0.5">Push Failed</span>
                {commitError}
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-2 text-blue-400 hover:underline block font-semibold"
                >
                  Clear Errors & Retry
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleCommitAndPush} className="space-y-4">
          {commitError && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4.5 h-4.5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">{commitError}</div>
              <button type="button" onClick={() => setCommitError(null)} className="text-red-400 hover:text-red-200 font-semibold self-start">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Repository Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Github className="w-3.5 h-3.5 text-slate-400" />
                Target Repository
              </label>
              <div className="relative">
                {loadingRepos ? (
                  <div className="w-full h-10 px-3 flex items-center bg-slate-950 border border-slate-800 rounded-lg text-slate-500 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2 text-blue-500" />
                    Loading repositories...
                  </div>
                ) : (
                  <select
                    id="repo-select"
                    value={selectedRepo}
                    onChange={(e) => setSelectedRepo(e.target.value)}
                    className="w-full h-10 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none"
                    required
                  >
                    {repos.length === 0 ? (
                      <option value="">No repositories found</option>
                    ) : (
                      repos.map((repo) => (
                        <option key={repo.id} value={repo.full_name}>
                          {repo.full_name} {repo.private ? "🔒" : "🌐"}
                        </option>
                      ))
                    )}
                  </select>
                )}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                  <Settings className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Branch Config */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                Destination Branch
              </label>
              <div className="relative">
                {loadingBranches ? (
                  <div className="w-full h-10 px-3 flex items-center bg-slate-950 border border-slate-800 rounded-lg text-slate-500 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2 text-blue-500" />
                    Loading branches...
                  </div>
                ) : isNewBranch ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="new-branch-input"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="new-sandbox-branch"
                      className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setIsNewBranch(false)}
                      className="px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        id="branch-select"
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="w-full h-10 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none"
                        required
                      >
                        {branches.length === 0 ? (
                          <option value="">No branches found</option>
                        ) : (
                          branches.map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.name}
                            </option>
                          ))
                        )}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <GitBranch className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <button
                      type="button"
                      id="create-branch-toggle-btn"
                      onClick={() => {
                        setIsNewBranch(true);
                        setNewBranchName("");
                      }}
                      className="px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Create a new branch for sandbox test"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      New
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* If creating a new branch, ask for base branch selection */}
          {isNewBranch && (
            <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-lg animate-fadeIn text-xs text-slate-400 space-y-1.5">
              <span className="font-semibold text-slate-300 block">Create Sandbox Branch</span>
              <div className="flex items-center gap-2">
                <span>Branch off of base:</span>
                <select
                  id="base-branch-select"
                  value={baseBranchName}
                  onChange={(e) => setBaseBranchName(e.target.value)}
                  className="bg-slate-900 border border-slate-850 rounded px-2 py-1 text-slate-200 focus:outline-none cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Commit Message Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-slate-400" />
              Commit Message
            </label>
            <textarea
              id="commit-message-input"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Features, improvements, and zip extraction files."
              rows={2}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-650 resize-none"
              required
            />
          </div>

          {/* Transfer Button */}
          <div className="pt-2">
            <button
              type="submit"
              id="push-to-github-btn"
              disabled={stagedFiles.length === 0}
              className={`w-full flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold transition-all shadow ${
                stagedFiles.length === 0
                  ? "bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/10 cursor-pointer"
              }`}
            >
              <Play className="w-4 h-4" />
              Transfer & Commit {stagedFiles.length} Staged File{stagedFiles.length === 1 ? "" : "s"} to GitHub
            </button>
            {stagedFiles.length === 0 && (
              <p className="text-[10px] text-center text-slate-500 mt-2 leading-none">
                * Select/stage at least 1 file in the workspace list to trigger the transfer.
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
