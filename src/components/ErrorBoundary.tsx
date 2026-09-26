import { ErrorBoundary as SentryErrorBoundary } from "@sentry/react";
import type { ReactNode } from "react";

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <SentryErrorBoundary
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#F7F9FC] p-6 text-[#152238]">
          <div className="w-full max-w-md rounded-2xl border border-[#DCE3EA] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-2 w-16 rounded-full bg-[#F28C28]" />
            <h1 className="text-2xl font-semibold">Vision Activ</h1>
            <p className="mt-3 text-sm text-[#667085]">
              Something went wrong. Please refresh the application and try again.
            </p>
            <button
              className="mt-6 rounded-xl bg-[#F28C28] px-5 py-3 text-sm font-semibold text-white hover:bg-[#D96F16]"
              onClick={() => window.location.reload()}
            >
              Refresh application
            </button>
          </div>
        </div>
      }
    >
      {children}
    </SentryErrorBoundary>
  );
}
