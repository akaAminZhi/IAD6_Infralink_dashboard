export function unwrapRecords<T>(json: unknown): T[] {
  if (Array.isArray(json)) {
    return json as T[];
  }

  if (
    json !== null &&
    typeof json === "object" &&
    Array.isArray((json as { records?: unknown }).records)
  ) {
    return (json as { records: T[] }).records;
  }

  return [];
}

const pendingRequests = new Map<string, Promise<unknown | null>>();

export function clearPendingJsonRequests(): void {
  pendingRequests.clear();
}

export function fetchJson<T>(url: string): Promise<T | null> {
  const existing = pendingRequests.get(url);
  if (existing) return existing as Promise<T | null>;
  const pending = loadJson<T>(url).finally(() => {
    if (pendingRequests.get(url) === pending) pendingRequests.delete(url);
  });
  pendingRequests.set(url, pending);
  return pending;
}

async function loadJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      console.warn(`Unable to load ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.warn(`Unable to load or parse ${url}`, error);
    return null;
  }
}
