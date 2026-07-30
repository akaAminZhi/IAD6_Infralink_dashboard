function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function getSearchGroupQueries(query: string): string[] {
  return normalizeSearchText(query)
    .split(new RegExp("[,\\uFF0C]+"))
    .map((group) => group.trim())
    .filter(Boolean);
}

function matchesWildcardExpression(value: string, expression: string): boolean {
  const segments = expression
    .split(/\*+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return false;
  }

  let cursor = 0;
  return segments.every((segment) => {
    const matchIndex = value.indexOf(segment, cursor);
    if (matchIndex < 0) {
      return false;
    }
    cursor = matchIndex + segment.length;
    return true;
  });
}

function matchesSearchGroup(value: string, groupQuery: string): boolean {
  const expressions = groupQuery
    .split(/[\s;|]+/)
    .map((expression) => expression.trim())
    .filter(Boolean);

  return (
    expressions.length > 0 &&
    expressions.every((expression) =>
      expression.includes("*")
        ? matchesWildcardExpression(value, expression)
        : value.includes(expression),
    )
  );
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

  const groups = getSearchGroupQueries(normalizedQuery);
  if (groups.length === 0) {
    return false;
  }

  const normalizedValues = values.map(normalizeSearchText).filter(Boolean);
  return groups.some((groupQuery) =>
    normalizedValues.some((value) => matchesSearchGroup(value, groupQuery)),
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
