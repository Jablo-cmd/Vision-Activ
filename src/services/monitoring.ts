/**
 * Optional browser error capture. Sentry is only downloaded when VITE_SENTRY_DSN is configured,
 * so deployments without it do not pay for the SDK. Personal data is never attached.
 */
type SentryModule = typeof import("@sentry/react");

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
let sentry: SentryModule | null = null;

export function initMonitoring() {
  if (!dsn) return;
  void import("@sentry/react")
    .then((mod) => {
      mod.init({
        dsn,
        environment: import.meta.env.MODE,
        integrations: [mod.browserTracingIntegration()],
        tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
      });
      sentry = mod;
    })
    .catch(() => {
      /* monitoring must never break the application */
    });
}

export function captureError(error: unknown) {
  sentry?.captureException(error);
}
