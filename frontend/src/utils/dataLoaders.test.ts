import { afterEach, describe, expect, it, vi } from "vitest";

import { clearPendingJsonRequests, fetchJson, unwrapRecords } from "./dataLoaders";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dataLoaders", () => {
  it("starts a fresh request after ETL invalidation without reusing an older pending response", async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 2 }))));
    const old = fetchJson("/data/reloaded.json");
    clearPendingJsonRequests();
    const fresh = fetchJson("/data/reloaded.json");
    expect(fresh).not.toBe(old);
    expect(await fresh).toEqual({ version: 2 });
    release(new Response(JSON.stringify({ version: 1 })));
    expect(await old).toEqual({ version: 1 });
  });
  it("shares concurrent requests but fetches again after completion", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => {
      release = resolve;
    })).mockResolvedValueOnce(new Response(JSON.stringify({ version: 2 })));
    vi.stubGlobal("fetch", fetchMock);
    const first = fetchJson("/data/shared.json");
    expect(fetchJson("/data/shared.json")).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ version: 1 })));
    expect(await first).toEqual({ version: 1 });
    expect(await fetchJson("/data/shared.json")).toEqual({ version: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows a retry after a shared failed request", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify([1])));
    vi.stubGlobal("fetch", fetchMock);
    const first = fetchJson("/data/retry.json");
    expect(fetchJson("/data/retry.json")).toBe(first);
    expect(await first).toBeNull();
    expect(await fetchJson("/data/retry.json")).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("unwraps arrays and records envelopes", () => {
    expect(unwrapRecords<number>([1, 2])).toEqual([1, 2]);
    expect(unwrapRecords<number>({ records: [3, 4] })).toEqual([3, 4]);
    expect(unwrapRecords<number>({ data: [5] })).toEqual([]);
  });

  it("returns parsed JSON for successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(fetchJson<{ ok: boolean }>("/data/test.json")).resolves.toEqual({
      ok: true,
    });
  });

  it("returns null for HTTP and parse failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockRejectedValueOnce(new Error("network")),
    );

    await expect(fetchJson("/missing.json")).resolves.toBeNull();
    await expect(fetchJson("/broken.json")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
