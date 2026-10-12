import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, writeFile, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { liveDataPlugin } from "../liveDataPlugin.js";

let root, server, origin;
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "iad6-live-data-"));
  const publicDir = path.join(root, "public");
  await mkdir(path.join(publicDir, "data"), { recursive: true });
  await writeFile(path.join(root, "outside.json"), '{"private":true}');
  const plugin = liveDataPlugin();
  plugin.configResolved({ publicDir, root });
  let middleware;
  plugin.configurePreviewServer({ middlewares: { use: handler => { middleware = handler; } } });
  server = createServer((req, res) => middleware(req, res, () => {
    res.end("compiled application asset / stale built dataset");
  }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (root) {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("iad6-live-data-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("reads a replaced ETL file without a server restart", async () => {
  const file = path.join(root, "public", "data", "summary.json");
  await writeFile(file, '{"version":1}');
  assert.deepEqual(await (await fetch(`${origin}/data/summary.json`)).json(), { version: 1 });
  await writeFile(file + ".tmp", '{"version":222}');
  await rename(file + ".tmp", file);
  const updated = await fetch(`${origin}/data/summary.json`, { headers: { "If-None-Match": "*" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get("cache-control"), "no-store");
  assert.deepEqual(await updated.json(), { version: 222 });
});

test("missing live files do not fall back to built data or SPA HTML", async () => {
  const response = await fetch(`${origin}/data/missing.json`);
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Dataset not found.");
});

test("compiled assets still use the regular preview server", async () => {
  const response = await fetch(`${origin}/assets/app.js`);
  assert.equal(await response.text(), "compiled application asset / stale built dataset");
});

test("serves CSV and supports HEAD without a response body", async () => {
  await writeFile(path.join(root, "public", "data", "pdms.csv"), "name\nPDM-A\n");
  const response = await fetch(`${origin}/data/pdms.csv`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.equal(await response.text(), "");
});

test("rejects writes and unapproved extensions", async () => {
  assert.equal((await fetch(`${origin}/data/summary.json`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${origin}/data/source.py`)).status, 404);
});

test("rejects encoded traversal and malformed escapes", async () => {
  for (const suffix of ["%2e%2e%2foutside.json", "%2e%2e%5coutside.json", "%00.json", "%ZZ.json"]) {
    const status = await new Promise((resolve, reject) => {
      const req = request(origin, { path: `/data/${suffix}` }, res => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 404);
  }
});

test("rejects directory links leading outside the data directory", async () => {
  const directory = path.join(root, "private");
  await mkdir(directory);
  await writeFile(path.join(directory, "secret.json"), '{"private":true}');
  await symlink(directory, path.join(root, "public", "data", "linked"), "junction");
  assert.equal((await fetch(`${origin}/data/linked/secret.json`)).status, 404);
});

test("actual Vite preview serves live data alongside unchanged compiled assets", async () => {
  const { preview } = await import("vite");
  await mkdir(path.join(root, "dist", "assets"), { recursive: true });
  await mkdir(path.join(root, "dist", "data"), { recursive: true });
  await writeFile(path.join(root, "dist", "index.html"), '<script src="/assets/app.js"></script>');
  await writeFile(path.join(root, "dist", "assets", "app.js"), "compiled frontend");
  await writeFile(path.join(root, "dist", "data", "stale-only.json"), '{"stale":true}');
  const instance = await preview({
    configFile: false, root, publicDir: path.join(root, "public"),
    plugins: [liveDataPlugin()], preview: { host: "127.0.0.1", port: 0 },
  });
  try {
    const url = `http://127.0.0.1:${instance.httpServer.address().port}`;
    const dataFile = path.join(root, "public", "data", "preview.json");
    await writeFile(dataFile, '{"version":1}');
    assert.deepEqual(await (await fetch(`${url}/data/preview.json`)).json(), { version: 1 });
    await writeFile(dataFile, '{"version":2}');
    assert.deepEqual(await (await fetch(`${url}/data/preview.json`)).json(), { version: 2 });
    assert.equal((await fetch(`${url}/data/stale-only.json`)).status, 404);
    assert.equal(await (await fetch(`${url}/assets/app.js`)).text(), "compiled frontend");
  } finally {
    await new Promise(resolve => instance.httpServer.close(resolve));
  }
});
