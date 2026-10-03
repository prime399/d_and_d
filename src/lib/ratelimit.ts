// Best-effort in-memory per-IP limiter (per function instance). Enough to stop casual abuse of the LLM key.
const hits = new Map<string, number[]>();

export function rateLimit(ip: string, limit = 40, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}
