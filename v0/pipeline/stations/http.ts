// One POST with retries, shared by the stations that call a model. A busy
// or failing server ("429 too many requests", 5xx) is tried again after a
// growing wait, as the experiments' scripts did; any other refusal is final.

const RETRIED_STATUSES = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 4;

/**
 * POSTs JSON and returns the parsed reply, retrying a busy server.
 *
 * @param url  The address.
 * @param headers  Extra headers (the key).
 * @param body  The request, sent as JSON.
 * @param timeoutMs  How long one attempt may take.
 * @param label  The vendor's name, for the error message.
 * @returns The reply's JSON.
 */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, label: string): Promise<any> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return response.json();

    // Wait 2, 4, 8 seconds between tries of a busy server; give up on anything else.
    const text = (await response.text()).slice(0, 300);
    const isBusy = RETRIED_STATUSES.has(response.status);
    if (!isBusy || attempt === ATTEMPTS) throw new Error(`${label} ${response.status}: ${text}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}
