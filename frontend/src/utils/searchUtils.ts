function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function getSearchTerms(query: string): string[] {
  return getSearchGroups(query).flat();
}

export function getSearchGroups(query: string): string[][] {
  return normalizeSearchText(query)
    .split(/[,，]+/)
    .map((group) =>
      group
        .split(/[\s*;|]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    )
    .filter((group) => group.length > 0);
}

export function matchesSearchQuery(values: unknown[], query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const groups = getSearchGroups(normalizedQuery);
  if (groups.length === 0) {
    return false;
  }

  const normalizedValues = values.map(normalizeSearchText).filter(Boolean);
  return groups.some((terms) =>
    normalizedValues.some((value) => terms.every((term) => value.includes(term))),
  );
}

export function getSearchMatchScore(
  primaryValues: unknown[],
  allValues: unknown[],
  query: string,
): number {
  const primary = primaryValues.map(normalizeSearchText).filter(Boolean);
  const groupQueries = normalizeSearchText(query)
    .split(/[,，]+/)
    .map((group) => group.trim())
    .filter(Boolean);

  return groupQueries.reduce((bestScore, groupQuery) => {
    if (primary.some((value) => value === groupQuery)) {
      return Math.min(bestScore, 0);
    }
    if (primary.some((value) => value.startsWith(groupQuery))) {
      return Math.min(bestScore, 1);
    }
    if (primary.some((value) => value.includes(groupQuery))) {
      return Math.min(bestScore, 2);
    }
    if (matchesSearchQuery(allValues, groupQuery)) {
      return Math.min(bestScore, 3);
    }
    return bestScore;
  }, Number.POSITIVE_INFINITY);
}
