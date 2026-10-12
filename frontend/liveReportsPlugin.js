import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function liveReportsPlugin() {
  let publicRoot;
  function middleware(request, response, next) {
    const pathname = (request.url ?? "/").split("?")[0];
    const directory = ["neta-reports", "neta-reports-gc", "issue-case-images", "references"]
      .find(name => pathname.startsWith(`/${name}/`));
    if (!directory) return next();
    response.setHeader("Cache-Control", "no-cache");
    function missing() {
      response.statusCode = 404;
      response.end("Report or attachment not found. Check files on the automation host.");
    }
    if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end("Method not allowed.");
      return;
    }
    const root = path.join(publicRoot, directory);
    let file;
    try {
      const relative = decodeURIComponent(pathname.slice(directory.length + 2));
      file = path.resolve(root, relative);
      if (relative.includes("\0") || !inside(root, file) ||
          (directory.startsWith("neta-reports") && path.extname(file).toLowerCase() !== ".pdf")) {
        return missing();
      }
    } catch { return missing(); }
    void (async () => {
      try {
        // The root may be a configured junction into the tracker repository.
        const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(file)]);
        if (!inside(canonicalRoot, canonicalFile)) return missing();
        const info = await stat(canonicalFile);
        if (!info.isFile()) return missing();
        const mimeTypes = {
          ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
          ".svg": "image/svg+xml", ".bmp": "image/bmp",
        };
        response.setHeader("Content-Type", mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream");
        response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Accept-Ranges", "bytes");
        let start = 0;
        let end = info.size - 1;
        const range = request.method === "GET" ? request.headers.range : undefined;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          let valid = Boolean(match && (match[1] || match[2]));
          if (valid) {
            if (match[1]) {
              start = Number(match[1]);
              end = match[2] ? Math.min(Number(match[2]), end) : end;
            } else {
              const suffix = Number(match[2]);
              valid = Number.isSafeInteger(suffix) && suffix > 0;
              start = Math.max(0, info.size - suffix);
            }
            valid = valid && Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
              start >= 0 && start <= end && start < info.size;
          }
          if (!valid) {
            response.statusCode = 416;
            response.setHeader("Content-Range", `bytes */${info.size}`);
            response.end();
            return;
          }
          response.statusCode = 206;
          response.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
        }
        response.setHeader("Content-Length", Math.max(0, end - start + 1));
        if (request.method === "HEAD" || info.size === 0) return response.end();
        const stream = createReadStream(canonicalFile, { start, end });
        stream.on("error", () => response.destroy());
        response.once("close", () => stream.destroy());
        stream.pipe(response);
      } catch { missing(); }
    })();
  }
  return {
    name: "iad6-live-reports",
    configResolved(config) { publicRoot = config.publicDir || path.join(config.root, "public"); },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
