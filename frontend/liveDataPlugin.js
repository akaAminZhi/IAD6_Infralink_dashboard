import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

// Keep compiled application assets, but serve ETL outputs from their live source.
export function liveDataPlugin() {
  let dataRoot;
  function inside(root, target) {
    const relative = path.relative(root, target);
    return relative !== "" && !relative.startsWith(`..${path.sep}`) &&
      relative !== ".." && !path.isAbsolute(relative);
  }
  function middleware(request, response, next) {
    const pathname = (request.url ?? "/").split("?")[0];
    if (!pathname.startsWith("/data/")) return next();
    response.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
      response.setHeader("Allow", "GET, HEAD");
      response.statusCode = 405;
      response.end("Method not allowed.");
      return;
    }
    let target;
    try {
      const relative = decodeURIComponent(pathname.slice("/data/".length));
      target = path.resolve(dataRoot, relative);
      if (relative.includes("\0") || !inside(dataRoot, target) ||
          ![".json", ".csv"].includes(path.extname(target).toLowerCase())) {
        throw new Error("Invalid data path");
      }
    } catch {
      response.statusCode = 404;
      response.end("Dataset not found.");
      return;
    }
    void (async () => {
      try {
        const [canonicalRoot, canonicalFile] = await Promise.all([realpath(dataRoot), realpath(target)]);
        if (!inside(canonicalRoot, canonicalFile)) throw new Error("Invalid data path");
        const info = await stat(canonicalFile);
        if (!info.isFile()) throw new Error("Dataset not found");
        response.setHeader("Content-Type", path.extname(target).toLowerCase() === ".json"
          ? "application/json; charset=utf-8" : "text/csv; charset=utf-8");
        response.setHeader("Content-Length", info.size);
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (request.method === "HEAD") return response.end();
        createReadStream(canonicalFile).on("error", () => response.destroy()).pipe(response);
      } catch {
        response.statusCode = 404;
        response.end("Dataset not found.");
      }
    })();
  }
  return {
    name: "iad6-live-data",
    configResolved(config) {
      dataRoot = path.resolve(config.publicDir || path.join(config.root, "public"), "data");
    },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
