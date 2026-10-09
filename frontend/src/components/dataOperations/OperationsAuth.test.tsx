import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false, userId: null as string | null, getToken: vi.fn() },
  access: vi.fn(),
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => mocks.auth,
  SignIn: () => <div>Email sign in</div>,
  UserButton: () => <button>Account</button>,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../utils/automationApi", () => ({
  getAutomationAccess: mocks.access,
  setAutomationTokenGetter: vi.fn(),
}));

let Gate: typeof import("./OperationsAuth").OperationsAuthGate;
beforeAll(async () => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
  Gate = (await import("./OperationsAuth")).OperationsAuthGate;
});
beforeEach(() => {
  vi.stubEnv("VITE_LOCAL_OPERATIONS_BYPASS", "false");
  mocks.auth.isLoaded = true;
  mocks.auth.isSignedIn = false;
  mocks.auth.userId = null;
  mocks.access.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("OperationsAuthGate", () => {
  it("allows configured localhost use only after the backend approves", async () => {
    vi.stubEnv("VITE_LOCAL_OPERATIONS_BYPASS", "true");
    mocks.access.mockResolvedValue({ user_id: "local_operator" });
    render(<Gate><div>Operations controls</div></Gate>);
    expect(await screen.findByText("Operations controls")).toBeInTheDocument();
    expect(screen.queryByText("Email sign in")).not.toBeInTheDocument();
  });

  it("keeps local operations locked if the backend bypass is disabled", async () => {
    vi.stubEnv("VITE_LOCAL_OPERATIONS_BYPASS", "true");
    mocks.access.mockRejectedValue(new Error("Sign in to use Data Operations."));
    render(<Gate><div>Operations controls</div></Gate>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in to use Data Operations");
    expect(screen.queryByText("Operations controls")).not.toBeInTheDocument();
  });
  it("shows sign-in without mounting operations or checking API access", () => {
    render(<Gate><div>Operations controls</div></Gate>);
    expect(screen.getByText("Email sign in")).toBeInTheDocument();
    expect(screen.queryByText("Operations controls")).not.toBeInTheDocument();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("waits for backend authorization before mounting operations", async () => {
    mocks.auth.isSignedIn = true;
    mocks.auth.userId = "user_operator";
    let resolve!: (value: { user_id: string }) => void;
    mocks.access.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<Gate><div>Operations controls</div></Gate>);
    expect(screen.queryByText("Operations controls")).not.toBeInTheDocument();
    await act(async () => { resolve({ user_id: "user_operator" }); });
    expect(await screen.findByText("Operations controls")).toBeInTheDocument();
  });

  it("keeps operations inaccessible when the backend rejects the user", async () => {
    mocks.auth.isSignedIn = true;
    mocks.auth.userId = "user_other";
    mocks.access.mockRejectedValue(new Error("Your account does not have Data Operations access."));
    render(<Gate><div>Operations controls</div></Gate>);
    expect(await screen.findByRole("alert")).toHaveTextContent("does not have Data Operations access");
    expect(screen.queryByText("Operations controls")).not.toBeInTheDocument();
  });

  it("removes controls on sign-out", async () => {
    mocks.auth.isSignedIn = true;
    mocks.auth.userId = "user_operator";
    mocks.access.mockResolvedValue({ user_id: "user_operator" });
    const view = render(<Gate><div>Operations controls</div></Gate>);
    await waitFor(() => expect(screen.getByText("Operations controls")).toBeInTheDocument());
    mocks.auth.isSignedIn = false;
    mocks.auth.userId = null;
    view.rerender(<Gate><div>Operations controls</div></Gate>);
    expect(screen.queryByText("Operations controls")).not.toBeInTheDocument();
    expect(screen.getByText("Email sign in")).toBeInTheDocument();
  });
});
