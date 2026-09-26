import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../components/ErrorBoundary";

function BrokenComponent() {
  throw new Error("test failure");
}

describe("ErrorBoundary", () => {
  it("renders the production recovery UI after a render error", () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Vision Activ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh application" })).toBeInTheDocument();
  });
});
