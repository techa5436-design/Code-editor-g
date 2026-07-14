import React, { useState, useEffect } from "react";
import { Github, Key, CheckCircle2, AlertTriangle, LogOut, Loader2, Info } from "lucide-react";
import { GitHubUser } from "../types";

interface GitHubConnectorProps {
  token: string | null;
  onConnect: (token: string, method: "oauth" | "pat") => void;
  onDisconnect: () => void;
}

export default function GitHubConnector({ token, onConnect, onDisconnect }: GitHubConnectorProps) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patInput, setPatInput] = useState("");
  const [showPatInput, setShowPatInput] = useState(false);
  const [clientIdConfigured, setClientIdConfigured] = useState<boolean | null>(null);

  // Check if GITHUB_CLIENT_ID is configured on the server
  useEffect(() => {
    fetch("/api/auth/github/url")
      .then((res) => res.json())
      .then((data) => {
        setClientIdConfigured(data.clientIdConfigured);
      })
      .catch((err) => {
        console.error("Failed to check client ID configuration:", err);
        setClientIdConfigured(false);
      });
  }, []);

  // Fetch GitHub User details when token changes
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    const fetchUser = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Invalid access token or expired credentials.");
          }
          throw new Error(`GitHub API returned status ${res.status}`);
        }

        const data = await res.json();
        setUser(data);
      } catch (err: any) {
        setError(err.message || "Failed to fetch user details.");
        onDisconnect(); // Log out if token is invalid
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [token]);

  // Handle OAuth Popup login
  const handleOAuthLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/github/url");
      if (!response.ok) {
        throw new Error("Failed to initialize GitHub OAuth session.");
      }
      const data = await response.json();

      if (!data.clientIdConfigured) {
        throw new Error("GitHub Client ID is not configured on the server.");
      }

      // Open OAuth provider directly in popup
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const authWindow = window.open(
        data.url,
        "github_oauth_popup",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
      );

      if (!authWindow) {
        setError("Popup was blocked by your browser. Please allow popups for this site.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "OAuth login failed.");
      setLoading(false);
    }
  };

  // Listen for OAuth Success message from callback popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }

      if (event.data?.type === "OAUTH_AUTH_SUCCESS" && event.data.accessToken) {
        onConnect(event.data.accessToken, "oauth");
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onConnect]);

  // Handle Personal Access Token connection
  const handlePatConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patInput.trim()) return;
    onConnect(patInput.trim(), "pat");
    setPatInput("");
    setShowPatInput(false);
  };

  return (
    <div id="github-connector-card" className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg">
            <Github className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">GitHub Connection</h2>
            <p className="text-xs text-slate-400">Authenticate to transfer files directly</p>
          </div>
        </div>
        {token && user && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
            Connected
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 p-3 bg-red-950/40 border border-red-900/60 text-red-300 rounded-lg text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-6">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
          <p className="text-sm text-slate-400">Verifying credentials with GitHub...</p>
        </div>
      ) : !token ? (
        <div className="space-y-4">
          <div className="text-sm text-slate-300 leading-relaxed">
            Choose how you would like to connect your GitHub account. You can log in securely via GitHub OAuth or use a Personal Access Token.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              id="github-oauth-btn"
              onClick={handleOAuthLogin}
              disabled={clientIdConfigured === false}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border font-medium text-sm transition-all shadow-sm ${
                clientIdConfigured === false
                  ? "bg-slate-850 border-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-slate-100 hover:bg-white text-slate-950 border-slate-200 cursor-pointer"
              }`}
            >
              <Github className="w-4 h-4" />
              Sign in with GitHub
            </button>

            <button
              type="button"
              id="github-pat-btn"
              onClick={() => setShowPatInput(!showPatInput)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg font-medium text-sm transition-all"
            >
              <Key className="w-4 h-4" />
              Use Access Token (PAT)
            </button>
          </div>

          {clientIdConfigured === false && (
            <div className="flex items-start gap-2.5 p-3 bg-slate-850 border border-slate-800 rounded-lg text-xs text-slate-400">
              <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">OAuth is not configured yet.</span> To authorize via popup, you must set <code className="text-amber-400">GITHUB_CLIENT_ID</code> and <code className="text-amber-400">GITHUB_CLIENT_SECRET</code> in the environment.
                <div className="mt-1">
                  <span className="font-semibold text-slate-300">Quick Start:</span> Create a <strong>Personal Access Token (PAT)</strong> on GitHub with the <code className="text-blue-400">repo</code> scope and use it directly instead!
                </div>
              </div>
            </div>
          )}

          {showPatInput && (
            <form onSubmit={handlePatConnect} className="mt-4 p-4 bg-slate-850 border border-slate-800 rounded-xl animate-fadeIn space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  GitHub Personal Access Token (PAT)
                </label>
                <input
                  type="password"
                  value={patInput}
                  onChange={(e) => setPatInput(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-750 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-600"
                  required
                />
              </div>
              <div className="text-xs text-slate-400 leading-normal">
                Requires the <code className="text-blue-400 font-semibold font-mono bg-slate-900 px-1 py-0.5 rounded">repo</code> scope to allow committing files. Create one in your{" "}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  GitHub Developer Settings
                </a>.
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPatInput(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
                >
                  Verify & Connect
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        user && (
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4 p-4 bg-slate-850 border border-slate-800 rounded-lg animate-fadeIn">
            <div className="flex items-center gap-3">
              <img
                src={user.avatar_url}
                alt={user.login}
                className="w-12 h-12 rounded-full border-2 border-slate-700"
                referrerPolicy="no-referrer"
              />
              <div>
                <div className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                  {user.name || user.login}
                  <a
                    href={user.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-blue-400 font-mono"
                  >
                    @{user.login}
                  </a>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Successfully authorized and active
                </div>
              </div>
            </div>
            <button
              type="button"
              id="github-disconnect-btn"
              onClick={onDisconnect}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/60 hover:bg-red-950/40 hover:text-red-300 hover:border-red-900/60 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        )
      )}
    </div>
  );
}
