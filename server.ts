import express from "express";
import http from "http";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const PYTHON_PORT = 8000;
let pythonProcess: ChildProcess | null = null;

function startPythonSentinel() {
  if (pythonProcess) return;

  console.log("[Node Server] Spawning Python Sentinel Gateway on port " + PYTHON_PORT + "...");
  const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
  pythonProcess = spawn(
    pythonExecutable,
    ["-m", "uvicorn", "agentarmor.sentinel.main:app", "--port", String(PYTHON_PORT), "--host", "127.0.0.1"],
    {
      stdio: "inherit",
      env: { ...process.env },
    }
  );

  pythonProcess.on("error", (err) => {
    console.error("[Python Sentinel Error]:", err);
  });

  pythonProcess.on("exit", (code, signal) => {
    console.log(`[Python Sentinel exited with code ${code}, signal ${signal}]`);
    pythonProcess = null;
  });
}

// Clean up child process on exit
process.on("exit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
process.on("SIGINT", () => {
  if (pythonProcess) pythonProcess.kill();
  process.exit();
});
process.on("SIGTERM", () => {
  if (pythonProcess) pythonProcess.kill();
  process.exit();
});

async function startServer() {
  startPythonSentinel();

  const app = express();

  // Proxy helper for Python FastAPI
  const proxyToSentinel = (req: express.Request, res: express.Response, targetPath: string) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: PYTHON_PORT,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${PYTHON_PORT}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("[Proxy Error]:", err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: "Sentinel gateway starting or unavailable",
          details: err.message,
        });
      }
    });

    req.pipe(proxyReq);
  };

  // Sentinel API endpoints proxy
  app.use("/api/sentinel", (req, res) => {
    const subPath = req.originalUrl.replace(/^\/api\/sentinel/, "") || "/";
    proxyToSentinel(req, res, subPath);
  });

  // Direct SSE Stream proxy
  app.use("/stream", (req, res) => {
    proxyToSentinel(req, res, "/stream");
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", gateway: "AgentArmor Node Gateway" });
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AgentArmor] Unified Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
