import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, after, test } from "node:test";
import { preview } from "vite";
import { liveReportsPlugin } from "../liveReportsPlugin.js";

let root, server, origin, file;
const pdf = "%PDF-1.4\nreport-test\n%%EOF\n";
const urlPath = "/neta-reports/EQ%20A/%E6%8A%A5%E5%91%8A%20%231.pdf";
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "iad6-live-reports-"));
  const publicDir = path.join(root, "public");
  const tracker = path.join(root, "tracker");
  await mkdir(path.join(tracker, "EQ A"), { recursive: true });
  await mkdir(path.join(publicDir, "neta-reports-gc"), { recursive: true });
  await symlink(tracker, path.join(publicDir, "neta-reports"), "junction");
  file = path.join(tracker, "EQ A", "报告 #1.pdf");
  await writeFile(file, pdf);
  await writeFile(path.join(publicDir, "neta-reports-gc", "gc.pdf"), pdf);
  await mkdir(path.join(root, "dist", "neta-reports"), { recursive: true });
  await writeFile(path.join(root, "dist", "index.html"), '<div id="root">dashboard</div>');
  await writeFile(path.join(root, "dist", "neta-reports", "stale.pdf"), pdf);
  server = await preview({ configFile: false, root, publicDir,
    plugins: [liveReportsPlugin()], preview: { host: "127.0.0.1", port: 0 } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  if (root) {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("iad6-live-reports-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("preview returns PDFs from a live junction with encoded filenames", async () => {
  const response = await fetch(origin + urlPath);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition"), /^inline;/);
  assert.equal(await response.text(), pdf);
  assert.equal((await fetch(`${origin}/neta-reports-gc/gc.pdf`)).status, 200);
});
test("updated reports are visible without a rebuild", async () => {
  await writeFile(file, pdf + "updated");
  const response = await fetch(origin + urlPath);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assert.equal(await response.text(), pdf + "updated");
  await writeFile(file, pdf);
});
test("missing PDF returns 404, never dashboard or stale built report", async () => {
  for (const name of ["missing.pdf", "stale.pdf"]) {
    const response = await fetch(`${origin}/neta-reports/${name}`);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /Report or attachment not found/);
  }
});
test("supports PDF viewer byte ranges", async () => {
  const response = await fetch(origin + urlPath, { headers: { Range: "bytes=0-4" } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 0-4/${pdf.length}`);
  assert.equal(await response.text(), "%PDF-");
  const suffix = await fetch(origin + urlPath, { headers: { Range: "bytes=-6" } });
  assert.equal(await suffix.text(), pdf.slice(-6));
  const open = await fetch(origin + urlPath, { headers: { Range: "bytes=5-" } });
  assert.equal(await open.text(), pdf.slice(5));
});
test("invalid or unsatisfiable ranges return 416", async () => {
  for (const range of ["bytes=100000-", "bytes=4-2", "bytes=-0", "bytes=", "bytes=0-1,3-4"]) {
    const response = await fetch(origin + urlPath, { headers: { Range: range } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), `bytes */${pdf.length}`);
  }
});
test("HEAD returns PDF metadata; writes and non-PDF files are blocked", async () => {
  const response = await fetch(origin + urlPath, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), String(pdf.length));
  assert.equal(await response.text(), "");
  assert.equal((await fetch(origin + urlPath, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${origin}/neta-reports/private.json`)).status, 404);
});
test("rejects traversal and escaping links inside the configured report root", async () => {
  const external = path.join(root, "outside");
  await mkdir(external);
  await writeFile(path.join(external, "secret.pdf"), pdf);
  await symlink(external, path.join(root, "tracker", "escape"), "junction");
  assert.equal((await fetch(`${origin}/neta-reports/escape/secret.pdf`)).status, 404);
  for (const suffix of ["%2e%2e%2foutside/secret.pdf", "%2e%2e%5coutside%5csecret.pdf", "%ZZ.pdf"]) {
    const status = await new Promise((resolve, reject) => {
      const req = request(origin, { path: `/neta-reports/${suffix}` }, res => {
        res.resume(); res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject); req.end();
    });
    assert.equal(status, 404);
  }
});

test("serves live issue images and reference drawings in code-only preview", async () => {
  const publicDir = path.join(root, "public");
  await mkdir(path.join(publicDir, "issue-case-images"));
  await mkdir(path.join(publicDir, "references"));
  const image = Buffer.from([137, 80, 78, 71]);
  await writeFile(path.join(publicDir, "issue-case-images", "evidence.png"), image);
  await writeFile(path.join(publicDir, "references", "plan.svg"), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const response = await fetch(`${origin}/issue-case-images/evidence.png`);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  const drawing = await fetch(`${origin}/references/plan.svg`);
  assert.equal(drawing.headers.get("content-type"), "image/svg+xml");
  assert.match(await drawing.text(), /<svg/);
  assert.equal((await fetch(`${origin}/issue-case-images/no-such-image.png`)).status, 404);
});
