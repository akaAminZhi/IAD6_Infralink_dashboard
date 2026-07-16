function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function getSearchTerms(query: string): string[] {
  return normalizeSearchText(query)
    .split(/[\s*,;|]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

export function matchesSearchQuery(values: unknown[], query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const terms = getSearchTerms(normalizedQuery);
  if (terms.length === 0) {
    return false;
  }

  return values
    .map(normalizeSearchText)
    .filter(Boolean)
    .some((value) => terms.every((term) => value.includes(term)));
}

export function getSearchMatchScore(
  primaryValues: unknown[],
  allValues: unknown[],
  query: string,
): number {
  const normalizedQuery = normalizeSearchText(query);
  const primary = primaryValues.map(normalizeSearchText).filter(Boolean);

  if (primary.some((value) => value === normalizedQuery)) {
    return 0;
  }
  if (primary.some((value) => value.startsWith(normalizedQuery))) {
    return 1;
  }
  if (primary.some((value) => value.includes(normalizedQuery))) {
    return 2;
  }
  return matchesSearchQuery(allValues, query) ? 3 : Number.POSITIVE_INFINITY;
}
