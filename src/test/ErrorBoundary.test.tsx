import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../components/ErrorBoundary";

describe("ErrorBoundary", () => {
  it("renders the production recovery UI after a render error", () => {
    function BrokenComponent(): never {
      throw new Error("test failure");
    }

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Vision Activ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh application" })).toBeInTheDocument();
  });
});
