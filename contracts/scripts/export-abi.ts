import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const artifact = JSON.parse(readFileSync(resolve("artifacts/src/Launchpad.sol/Launchpad.json"), "utf8"));
mkdirSync("abi", { recursive: true });
writeFileSync("abi/Launchpad.json", `${JSON.stringify(artifact.abi, null, 2)}\n`);
console.log("Wrote abi/Launchpad.json");