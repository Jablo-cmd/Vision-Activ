import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "../services/monitoring";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error);
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-ink-900">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card"
        >
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-brand-600" />
          <h1 className="text-2xl">Something went wrong</h1>
          <p className="mt-3 text-sm text-ink-500">
            The page could not be displayed. Your data has not been changed. Refresh to try again.
          </p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
