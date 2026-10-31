type Responder = Response | ((req: Request) => Response | Promise<Response>);

/**
 * Build a fake `fetch` that answers with the given responders in order.
 * Calling it more times than there are responders throws.
 */
export function mockFetch(...responders: Responder[]): {
  fetch: typeof globalThis.fetch;
  calls: Request[];
} {
  const calls: Request[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const index = calls.length;
    calls.push(req);
    const responder = responders[index];
    if (responder === undefined) {
      throw new Error(`mockFetch: unexpected call #${String(index + 1)} to ${req.url}`);
    }
    return typeof responder === "function" ? await responder(req) : responder;
  };
  return { fetch: fetchImpl, calls };
}

/** Create a JSON `Response`. */
export function json(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}
