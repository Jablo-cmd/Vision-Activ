import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ErrorBoundary } from "../components/ErrorBoundary";

// The copy was rewritten when the Sentry boundary was replaced by a lazy-loading one; the behaviour
// under test (recovery UI instead of a blank page, no error details shown) is unchanged.
describe("ErrorBoundary", () => {
  it("renders children when nothing fails", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("renders the recovery UI after a render error without leaking the error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function BrokenComponent(): never {
      throw new Error("secret stack detail");
    }

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.queryByText(/secret stack detail/)).not.toBeInTheDocument();
  });
});
