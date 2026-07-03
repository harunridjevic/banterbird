"use client";

import { useEffect } from "react";

export function ClientErrorReporter() {
  useEffect(() => {
    const report = (message: string, source: string, stack?: string) => {
      void fetch("/api/ops/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, message, stack }),
      }).catch(() => undefined);
    };

    const onError = (event: ErrorEvent) => {
      report(event.message, "window.onerror", event.error?.stack);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      report(message, "unhandledrejection", stack);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
