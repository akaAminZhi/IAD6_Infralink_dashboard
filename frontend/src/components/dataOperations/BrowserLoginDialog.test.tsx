import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserLoginSession } from "../../types/automation";
import { browserLoginAction, closeBrowserLogin, startBrowserLogin } from "../../utils/automationApi";
import { BrowserLoginDialog } from "./BrowserLoginDialog";

vi.mock("../../utils/automationApi", () => ({
  startBrowserLogin: vi.fn(), browserLoginAction: vi.fn(), closeBrowserLogin: vi.fn(),
}));
const session: BrowserLoginSession = {
  session_id: "login-owned", provider: "jc2", status: "ready", error: null,
  width: 1180, height: 760, image: "data:image/jpeg;base64,fixture",
};
beforeEach(() => {
  vi.mocked(startBrowserLogin).mockResolvedValue(session);
  vi.mocked(browserLoginAction).mockImplementation(async (_id, action) =>
    ({ ...session, status: action.kind === "save" ? "saved" : "ready" }));
  vi.mocked(closeBrowserLogin).mockResolvedValue({ status: "closed" });
});
afterEach(() => vi.clearAllMocks());

describe("personal browser login", () => {
  it("shows phone MFA instructions and maps image clicks to remote coordinates", async () => {
    render(<BrowserLoginDialog provider="jc2" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/approve MFA on your phone/)).toBeInTheDocument();
    const image = await screen.findByAltText("Your personal provider login browser");
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 590, height: 380 } as DOMRect);
    fireEvent.click(image, { clientX: 50, clientY: 60 });
    await waitFor(() => expect(browserLoginAction).toHaveBeenCalledWith("login-owned", { kind: "click", x: 80, y: 80 }));
  });

  it("sends typed text to the selected field and clears the local entry", async () => {
    const user = userEvent.setup();
    render(<BrowserLoginDialog provider="cxalloy" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByAltText("Your personal provider login browser");
    const field = screen.getByLabelText("Text for selected login field");
    await user.type(field, "test-password");
    await user.click(screen.getByRole("button", { name: "Send text" }));
    await waitFor(() => expect(browserLoginAction).toHaveBeenCalledWith("login-owned", { kind: "text", text: "test-password" }));
    expect(field).toHaveValue("");
  });

  it("refreshes personal session status after saving and closes the dialog", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn(), onClose = vi.fn();
    render(<BrowserLoginDialog provider="jc2" onSaved={onSaved} onClose={onClose} />);
    await screen.findByAltText("Your personal provider login browser");
    await user.click(screen.getByRole("button", { name: "Save my session" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes a login window whose start response arrives after unmount", async () => {
    let finish!: (session: BrowserLoginSession) => void;
    vi.mocked(startBrowserLogin).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<BrowserLoginDialog provider="jc2" onClose={vi.fn()} onSaved={vi.fn()} />);
    view.unmount();
    await act(async () => { finish(session); });
    expect(closeBrowserLogin).toHaveBeenCalledWith("login-owned");
  });
});
