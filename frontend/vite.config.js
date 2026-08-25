import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const epsTrackerRoot = path.resolve(
    process.env.IAD6_EPS_TRACKER_ROOT ?? path.join(frontendRoot, "..", "..", "IAD6_EPS_Testing_Tracker"),
);
const feederCableAtpRoot = path.join(epsTrackerRoot, "downloads", "feeder_cable_atp");
const feederCableAtpPrefix = "/feeder-cable-atp/";

function feederCableAtpMiddleware(request, response, next) {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith(feederCableAtpPrefix)) {
        next();
        return;
    }

    let relativePath;
    try {
        relativePath = decodeURIComponent(pathname.slice(feederCableAtpPrefix.length));
    } catch {
        response.statusCode = 400;
        response.end("Invalid ATP file path.");
        return;
    }

    const filePath = path.resolve(feederCableAtpRoot, relativePath);
    const isInsideAtpRoot = filePath.startsWith(`${feederCableAtpRoot}${path.sep}`);
    if (!isInsideAtpRoot || path.extname(filePath).toLowerCase() !== ".pdf") {
        response.statusCode = 404;
        response.end("ATP PDF not found.");
        return;
    }

    void stat(filePath)
        .then((fileStats) => {
            if (!fileStats.isFile()) {
                response.statusCode = 404;
                response.end("ATP PDF not found.");
                return;
            }
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/pdf");
            response.setHeader("Content-Length", String(fileStats.size));
            response.setHeader("Content-Disposition", `inline; filename="${path.basename(filePath)}"`);
            response.setHeader("Cache-Control", "no-cache");
            createReadStream(filePath).pipe(response);
        })
        .catch(() => {
            response.statusCode = 404;
            response.end("ATP PDF not found.");
        });
}

function feederCableAtpPlugin() {
    return {
        name: "iad6-feeder-cable-atp",
        configureServer(server) {
            server.middlewares.use(feederCableAtpMiddleware);
        },
        configurePreviewServer(server) {
            server.middlewares.use(feederCableAtpMiddleware);
        },
    };
}

export default defineConfig({
    plugins: [react(), feederCableAtpPlugin()],
    server: {
        host: '0.0.0.0',
        allowedHosts: [
            '.ngrok-free.app',
            '.trycloudflare.com'
        ]
    }
});
