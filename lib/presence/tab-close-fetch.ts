/** Fire-and-forget request that survives tab close (supports auth cookies + JSON body). */
export function tabCloseFetch(path: string, body?: Record<string, unknown>): void {
  try {
    void fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      keepalive: true,
      credentials: "include",
    });
  } catch {
    // ignore — best effort during unload
  }
}
