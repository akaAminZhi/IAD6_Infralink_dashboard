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

export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
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
