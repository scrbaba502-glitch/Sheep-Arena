import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const adapter = readFileSync(resolve(root, "cloudflare-client.js"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.trim().length > 0);

scripts.forEach((source, index) => new vm.Script(source, { filename: "index.html:inline-script-" + (index + 1) }));
new vm.Script(adapter, { filename: "cloudflare-client.js" });
console.log("Frontend JavaScript syntax checks passed (" + scripts.length + " inline scripts + Cloudflare adapter).");
