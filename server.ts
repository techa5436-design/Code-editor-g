import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Fixes for ES Module path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing support
  app.use(express.json({ limit: "50mb" }));

  // API Route: Get GitHub OAuth Authorization URL
  app.get("/api/auth/github/url", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${appUrl}/auth/callback`;

    if (!clientId) {
      return res.status(400).json({
        error: "GITHUB_CLIENT_ID is not configured in environment variables.",
        clientIdConfigured: false,
      });
    }

    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=repo%20user`;

    res.json({
      url: githubAuthUrl,
      clientIdConfigured: true,
    });
  });

  // API Route: GitHub OAuth Callback
  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #ef4444;">Authentication Failed</h2>
            <p>Missing authorization code from GitHub.</p>
            <button onclick="window.close()">Close Window</button>
          </body>
        </html>
      `);
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #ef4444;">Server Configuration Error</h2>
            <p>GitHub Client ID or Client Secret is missing on the server.</p>
            <button onclick="window.close()">Close Window</button>
          </body>
        </html>
      `);
    }

    try {
      // Exchange code for Access Token
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`GitHub token exchange failed: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const accessToken = tokenData.access_token;

      // HTML response that posts the success message back to the parent iframe and closes
      res.send(`
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0f172a; color: #f8fafc;">
            <div style="background-color: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); text-align: center; max-width: 400px; width: 90%;">
              <div style="width: 4rem; height: 4rem; background-color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
                <svg style="width: 2rem; height: 2rem; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h2 style="margin: 0 0 0.5rem 0; font-size: 1.5rem; font-weight: 700;">Connected to GitHub!</h2>
              <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem 0;">Successfully authorized with your GitHub account. This window will close automatically.</p>
              <div style="font-size: 0.85rem; color: #64748b;">Transferring credentials...</div>
            </div>
            <script>
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'OAUTH_AUTH_SUCCESS', 
                    accessToken: '${accessToken}' 
                  }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              }, 500);
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("OAuth token exchange error:", error);
      res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #0f172a; color: #f8fafc;">
            <div style="background-color: #1e293b; padding: 2.5rem; border-radius: 1rem; max-width: 400px; margin: auto;">
              <h2 style="color: #ef4444; margin-top: 0;">Authentication Error</h2>
              <p style="color: #94a3b8;">${error.message || "An unexpected error occurred during GitHub authentication."}</p>
              <button onclick="window.close()" style="background-color: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  // Integrate Vite as Middleware in non-production environments
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve pre-built static files from /dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
