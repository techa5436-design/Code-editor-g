export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  description: string;
  default_branch: string;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}

export interface StagedFile {
  path: string;
  content: string; // text files hold raw text, binary files hold base64
  isBinary: boolean;
  size: number;
  staged: boolean;
}

export interface CommitStep {
  id: string;
  label: string;
  status: "idle" | "running" | "success" | "error";
  details?: string;
}
