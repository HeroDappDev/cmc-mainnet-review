import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

// Reuse an unchanged production build on restart; rebuild after source/config edits.
const hash = createHash("sha256");
function include(path) {
  if (!existsSync(path)) return;
  if (["src", "public"].includes(path) || !path.includes(".")) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else hash.update(child).update(readFileSync(child));
    }
  } else hash.update(path).update(readFileSync(path));
}
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) walk(child);
    else hash.update(child).update(readFileSync(child));
  }
}
for (const path of ["src", "public", "package.json", "next.config.mjs", "postcss.config.mjs", "tsconfig.json", "../../pnpm-lock.yaml", "scripts/preview.mjs"]) include(path);
hash.update(process.version);
const fingerprint = hash.digest("hex");
const stamp = ".next/cmc-source-hash";
if (!existsSync(".next/BUILD_ID") || !existsSync(stamp) || readFileSync(stamp, "utf8") !== fingerprint) {
  console.log("Building optimized CMC preview. Pages will not compile during navigation.");
  const result = spawnSync("pnpm", ["run", "build"], { stdio: "inherit", env: { ...process.env, CMC_DEV_MODE: "0" } });
  if (result.status !== 0) process.exit(result.status ?? 1);
  writeFileSync(stamp, fingerprint);
} else console.log("Reusing current optimized CMC build.");
const require = createRequire(import.meta.url);
// Own the Next process directly so shutdown reaches the actual port listener.
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "0.0.0.0"], { stdio: "inherit", env: { ...process.env, CMC_DEV_MODE: "0" } });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("error", () => {
  console.error("Failed to launch the CMC server.");
  process.exit(1);
});
server.on("exit", (code, signal) => process.exit(code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1)));