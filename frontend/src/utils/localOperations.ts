export function isLocalOperationsMode(hostname = window.location.hostname): boolean {
  return import.meta.env.VITE_LOCAL_OPERATIONS_BYPASS === "true" &&
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}
