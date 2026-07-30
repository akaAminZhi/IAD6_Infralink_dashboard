import { describe, expect, it } from "vitest";

import {
  getSearchMatchScore,
  getSearchTerms,
  matchesSearchQuery,
} from "./searchUtils";

describe("searchUtils", () => {
  it("treats comma-separated groups as OR alternatives", () => {
    expect(
      matchesSearchQuery(["IAD06-PDM-E6-210-01-MDB"], "210-01,110-01"),
    ).toBe(true);
    expect(
      matchesSearchQuery(["IAD06-PDM-E6-220-01-MDB"], "210-01,110-01"),
    ).toBe(false);
  });

  it("requires every term in one group to match in sequence", () => {
    expect(
      matchesSearchQuery(
        ["IAD06-PDM-E6-110-WEST GALLERY-A"],
        "110 gallery",
      ),
    ).toBe(true);
    expect(
      matchesSearchQuery(["IAD06-PDM-E6-110-01-MDB"], "110 gallery"),
    ).toBe(false);
  });

  it("supports ordered wildcard segments without matching unrelated suffixes", () => {
    expect(matchesSearchQuery(["IAD06-PDM-E6-220-01-MDB"], "220-*M")).toBe(
      true,
    );
    expect(
      matchesSearchQuery(["IAD06-PDM-E6-220-EAST GALLERY-A"], "220-*M"),
    ).toBe(false);
  });

  it("normalizes full-width commas and produces search terms", () => {
    expect(getSearchTerms("210-01， 110-01")).toEqual(["210-01", "110-01"]);
  });

  it("ranks exact primary matches ahead of secondary matches", () => {
    expect(
      getSearchMatchScore(["PDM-1"], ["PDM-1", "EQ-1"], "PDM-1"),
    ).toBe(0);
    expect(
      getSearchMatchScore(["PDM-1"], ["PDM-1", "EQ-1"], "EQ-1"),
    ).toBe(3);
    expect(
      getSearchMatchScore(["PDM-1"], ["PDM-1", "EQ-1"], "missing"),
    ).toBe(Number.POSITIVE_INFINITY);
  });
});
