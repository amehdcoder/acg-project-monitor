import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ check: vi.fn(), apply: vi.fn(), state: {
  status: "current", updateAvailable: false, error: null as string | null,
} }));
vi.mock("@/lib/appUpdateManager", () => ({
  checkForAppUpdate: mocks.check, hardReloadToLatest: mocks.apply,
  getAppUpdateState: () => mocks.state, getLastAppliedAt: () => null,
  subscribeToAppUpdates: () => () => {},
}));
vi.mock("sonner", () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));
import AppUpdateButton from "./AppUpdateButton";

describe("Update button actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = { status: "current", updateAvailable: false, error: null };
  });
  afterEach(cleanup);

  it("an unchanged published version never triggers a reload", async () => {
    mocks.check.mockResolvedValue(mocks.state);
    render(<AppUpdateButton />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("a verified new version installs once despite repeated taps", async () => {
    mocks.check.mockResolvedValue({ ...mocks.state, updateAvailable: true });
    mocks.apply.mockResolvedValue(true);
    render(<AppUpdateButton />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it("failed installation unlocks the button for a successful retry", async () => {
    mocks.check.mockResolvedValue({ ...mocks.state, updateAvailable: true });
    mocks.apply.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<AppUpdateButton />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
  });
});