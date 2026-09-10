import "server-only";
import { normalizeOura, normalizeOuraSleepDetail, mergeMetric, type NormalizedMetric } from "./recovery";

const BASE = "https://api.ouraring.com/v2/usercollection";

/**
 * Pull the last `days` of Oura data with a personal access token (from
 * cloud.ouraring.com → Personal Access Tokens) or an OAuth bearer token.
 * Returns normalized daily metrics and never throws for an empty range — an
 * auth or network failure throws with a readable message so the caller can
 * surface it.
 */
export async function fetchOura(token: string, startDate: string, endDate: string) {
  const query = `?start_date=${startDate}&end_date=${endDate}`;

  const getDocs = async (path: string): Promise<unknown[]> => {
    const res = await fetch(`${BASE}/${path}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401) throw new Error("Oura rejected the token. Check it and reconnect.");
    if (!res.ok) throw new Error(`Oura ${path} returned HTTP ${res.status}.`);
    const json = (await res.json()) as { data?: unknown[] };
    return Array.isArray(json.data) ? json.data : [];
  };

  const [dailySleep, dailyReadiness, sleepDetail] = await Promise.all([
    getDocs("daily_sleep"),
    getDocs("daily_readiness"),
    getDocs("sleep"),
  ]);

  // daily_* give scores; the detailed sleep docs give durations and HR/HRV.
  const base = normalizeOura(dailySleep, dailyReadiness);
  const detail = normalizeOuraSleepDetail(sleepDetail);

  const byDate = new Map<string, NormalizedMetric>();
  for (const m of base) byDate.set(m.date, m);
  for (const m of detail) {
    const existing = byDate.get(m.date);
    byDate.set(m.date, existing ? mergeMetric(existing, m) : m);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
