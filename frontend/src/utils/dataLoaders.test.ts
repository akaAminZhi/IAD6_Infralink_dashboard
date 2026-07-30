import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson, unwrapRecords } from "./dataLoaders";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dataLoaders", () => {
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
