import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const publicRoot = resolve(projectRoot, "public");

export function installPublicAssetFetch({ onRequest = null } = {}) {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const requested = typeof input === "string" ? input : input?.url || String(input);
    if (!requested.startsWith("/data/vox-snapshot/")) return nativeFetch(input, init);

    onRequest?.(requested, init);
    const assetPath = resolve(publicRoot, requested.replace(/^\/+/, ""));
    if (assetPath !== publicRoot && !assetPath.startsWith(`${publicRoot}${sep}`)) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const body = await readFile(assetPath);
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      if (error?.code === "ENOENT") return new Response("Not found", { status: 404 });
      throw error;
    }
  };
  return () => {
    globalThis.fetch = nativeFetch;
  };
}
