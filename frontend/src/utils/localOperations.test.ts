import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalOperationsMode } from "./localOperations";

afterEach(() => vi.unstubAllEnvs());

describe("local operations mode", () => {
  it("requires the explicit frontend setting", () => {
    vi.stubEnv("VITE_LOCAL_OPERATIONS_BYPASS", "false");
    expect(isLocalOperationsMode("localhost")).toBe(false);
  });

  it("allows only loopback hostnames, never ngrok or lookalike names", () => {
    vi.stubEnv("VITE_LOCAL_OPERATIONS_BYPASS", "true");
    for (const hostname of ["localhost", "127.0.0.1", "[::1]", "::1"]) {
      expect(isLocalOperationsMode(hostname)).toBe(true);
    }
    for (const hostname of ["dashboard.ngrok-free.app", "localhost.evil.example", "192.168.1.5"]) {
      expect(isLocalOperationsMode(hostname)).toBe(false);
    }
  });
});
