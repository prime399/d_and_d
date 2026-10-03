// Best-effort in-memory limits (per function instance). Enough to stop casual abuse of the LLM key;
// pair with a Vercel Firewall rate-limit rule on /api/dm for real protection.
const hits = new Map<string, number[]>();
const daily = new Map<string, { day: number; n: number }>();
let globalHits: number[] = [];
let inFlight = 0;

/** Client IP from platform-set headers. The first x-forwarded-for hop is client-controlled, so use the last. */
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const hops = req.headers.get('x-forwarded-for')?.split(',').map((h) => h.trim()).filter(Boolean);
  return hops?.length ? hops[hops.length - 1] : 'local';
}

export function rateLimit(ip: string, limit = 20, windowMs = 60_000): boolean {
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

/** Per-instance cap across all callers. */
export function globalLimit(limit = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < windowMs);
  if (globalHits.length >= limit) return false;
  globalHits.push(now);
  return true;
}

/** Per-IP daily cap on DM calls. */
export function dailyLimit(ip: string, limit = 300): boolean {
  const day = Math.floor(Date.now() / 86_400_000);
  const cur = daily.get(ip);
  const rec = cur && cur.day === day ? cur : { day, n: 0 };
  if (rec.n >= limit) return false;
  rec.n += 1;
  daily.set(ip, rec);
  if (daily.size > 20_000) daily.clear();
  return true;
}

/** Concurrency gate for model generations. Returns a release fn, or null when full. */
export function acquireSlot(max = 4): (() => void) | null {
  if (inFlight >= max) return null;
  inFlight += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      inFlight -= 1;
    }
  };
}
