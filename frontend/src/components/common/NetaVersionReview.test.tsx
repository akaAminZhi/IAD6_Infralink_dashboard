import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as api from "../../utils/automationApi";
import { NetaVersionReview } from "./NetaVersionReview";

vi.mock("../dataOperations/OperationsAuth", () => ({ useOperationsIdentity: () => "operator" }));

afterEach(() => vi.restoreAllMocks());

it.each(["keep", "adopt"] as const)("previews both versions before saving %s", async choice => {
  const user = userEvent.setup();
  const file = { name: "Test.pdf", source: "main" as const, uploaded_at: "", identifier: "CDS6-FB4",
    verdict: "PASSED", sha256: "a".repeat(64) };
  const match = { id: "b".repeat(64), revision: "c".repeat(64), device: "CDS6", current: file,
    candidate: { ...file, source: "updates" as const, sha256: "d".repeat(64) }, decision: null };
  vi.spyOn(api, "getNetaVersionMatches").mockResolvedValue({ matches: [match] });
  vi.spyOn(api, "getNetaVersionPdf").mockResolvedValue(new Blob([], { type: "application/pdf" }));
  const save = vi.spyOn(api, "saveNetaVersionDecision").mockResolvedValue({ decision: choice });
  const create = vi.fn().mockReturnValue("blob:preview");
  const revoke = vi.fn();
  Object.defineProperties(URL, { createObjectURL: { value: create, configurable: true },
    revokeObjectURL: { value: revoke, configurable: true } });

  const view = render(<NetaVersionReview equipmentId="CDS6" />);
  await user.click(await screen.findByRole("button", { name: "Compare PDFs" }));
  expect(await screen.findByTitle("Current version PDF")).toHaveAttribute("src", "blob:preview");
  expect(screen.getByTitle("Candidate version PDF")).toHaveAttribute("src", "blob:preview");
  await user.click(screen.getByRole("button", { name: choice === "keep" ? "Keep current" : "Use candidate" }));
  expect(await screen.findByText(/Run the manual NETA refresh to apply/)).toBeInTheDocument();
  expect(save).toHaveBeenCalledWith(match, choice);
  view.unmount();
  expect(revoke).toHaveBeenCalledTimes(2);
});
