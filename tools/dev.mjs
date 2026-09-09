import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
async function freePort(start) {
  for (let port = start; port < start + 30; port += 1) {
    const free = await new Promise((resolvePort) => {
      const probe = createServer();
      probe.once("error", () => resolvePort(false));
      probe.listen(port, "127.0.0.1", () =>
        probe.close(() => resolvePort(true)),
      );
    });
    if (free) return port;
  }
  throw new Error(`No available port near ${start}`);
}
const apiPort = await freePort(3001);
const port = await freePort(5173);
const children = [];
function launch(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!stopping) shutdown(code || 1);
  });
  return child;
}
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
launch(["--import", "tsx", "server/index.ts"], {
  SERVER_PORT: String(apiPort),
  SERVER_HOST: "127.0.0.1",
  PORT: String(apiPort),
});
for (let attempt = 0; attempt < 100; attempt += 1) {
  if (stopping) process.exit(1);
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
    if (response.ok) break;
  } catch {
    /* API process is still starting. */
  }
  if (attempt === 99) {
    shutdown(1);
    throw new Error("API did not start");
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}
launch(
  [
    resolve(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { API_PORT: String(apiPort) },
);
await mkdir(resolve(root, ".local"), { recursive: true });
await writeFile(
  resolve(root, ".local/dev.json"),
  JSON.stringify(
    {
      port,
      apiPort,
      url: `http://127.0.0.1:${port}`,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  `\nSHOV: http://127.0.0.1:${port}\nAPI: http://127.0.0.1:${apiPort}\n`,
);
