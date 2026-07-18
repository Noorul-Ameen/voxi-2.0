import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
const worker = { async fetch(request: Request, env: any, ctx: any) { const url = new URL(request.url); if (url.pathname === "/_vinext/image") return handleImageOptimization(request, { fetchAsset: (path: string) => env.ASSETS.fetch(new Request(new URL(path, request.url))), transformImage: async (body: ReadableStream, { width, format, quality }: any) => (await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality })).response() }, [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES]); return handler.fetch(request, env, ctx); } };
export default worker;
