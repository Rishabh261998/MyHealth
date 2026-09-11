import { Moon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import Stat from "@/components/Stat";
import TrendChart from "@/components/charts/TrendChart";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { ensureIngestToken } from "@/lib/sharecode";
import { addDaysStr, shortDate, todayInTz } from "@/lib/dates";
import {
  getLatestRecovery,
  getRecoverySeries,
  getWearableConnections,
} from "@/lib/queries";
import RecoveryPanel from "./RecoveryPanel";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);
  const since = addDaysStr(today, -30);

  const [series, latest, connections, ingestToken] = await Promise.all([
    getRecoverySeries(user.id, since),
    getLatestRecovery(user.id),
    getWearableConnections(user.id),
    ensureIngestToken(user.id),
  ]);

  // Build the absolute webhook URL with the token embedded, so the phone needs
  // one value, not two. Origin comes from the request so it is correct on any
  // domain the app is served from.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = host ? `${proto}://${host}` : "";
  const ingestUrl = `${origin}/api/ingest/wearable?token=${ingestToken}`;

  // A QR of that URL so it can be handed to the phone by scanning, nothing typed.
  const ingestQr = await QRCode.toString(ingestUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0f14", light: "#ffffff" },
  });

  const oura = connections.find((c) => c.source === "oura") ?? null;

  const sleepData = series
    .filter((r) => r.sleep_hours != null || r.sleep_score != null)
    .map((r) => ({
      label: shortDate(r.date),
      sleep: r.sleep_hours != null ? Math.round(Number(r.sleep_hours) * 10) / 10 : null,
      score: r.sleep_score != null ? Number(r.sleep_score) : null,
    }));

  const recoveryData = series
    .filter((r) => r.readiness != null || r.hrv_ms != null || r.resting_hr != null)
    .map((r) => ({
      label: shortDate(r.date),
      readiness: r.readiness != null ? Number(r.readiness) : null,
      hrv: r.hrv_ms != null ? Number(r.hrv_ms) : null,
      restingHr: r.resting_hr != null ? Number(r.resting_hr) : null,
    }));

  const hasData = series.length > 0;

  return (
    <>
      <PageHeader
        title="Recovery"
        subtitle="Sleep, HRV and readiness from your wearable"
        back="/more"
      />

      {latest && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat
            label="Last sleep"
            value={latest.sleep_hours != null ? `${Math.round(Number(latest.sleep_hours) * 10) / 10}h` : "—"}
            sub={latest.sleep_score != null ? `score ${latest.sleep_score}` : shortDate(latest.date)}
          />
          <Stat
            label="Readiness"
            value={latest.readiness != null ? String(latest.readiness) : "—"}
            tone={
              latest.readiness == null
                ? "default"
                : latest.readiness >= 70
                  ? "good"
                  : latest.readiness >= 50
                    ? "warn"
                    : "bad"
            }
          />
          <Stat
            label="Resting HR"
            value={latest.resting_hr != null ? `${latest.resting_hr}` : "—"}
            sub={latest.hrv_ms != null ? `HRV ${latest.hrv_ms}ms` : "bpm"}
          />
        </div>
      )}

      {sleepData.length > 1 && (
        <div className="mb-4">
          <TrendChart
            title="Sleep"
            subtitle="Hours per night"
            data={sleepData}
            suffix="h"
            series={[{ key: "sleep", label: "Hours slept", color: "var(--series-1)" }]}
          />
        </div>
      )}

      {recoveryData.length > 1 && (
        <div className="mb-4">
          <TrendChart
            title="Readiness & HRV"
            subtitle="Higher readiness and HRV, lower resting HR = better recovered"
            data={recoveryData}
            series={[
              { key: "readiness", label: "Readiness", color: "var(--series-1)" },
              { key: "hrv", label: "HRV (ms)", color: "var(--series-2)" },
            ]}
          />
        </div>
      )}

      {!hasData && (
        <div className="mb-4">
          <Empty
            title="No recovery data yet"
            hint="Connect Oura below, push from your Apple Watch, or add a night manually — then your sleep and readiness trends appear here."
          >
            <Moon size={22} className="mt-1 text-muted" />
          </Empty>
        </div>
      )}

      <RecoveryPanel
        today={today}
        ingestUrl={ingestUrl}
        ingestQr={ingestQr}
        oura={
          oura
            ? {
                connected: true,
                lastSyncStatus: oura.lastSyncStatus,
                lastSyncMessage: oura.lastSyncMessage,
                lastSyncAt: oura.lastSyncAt?.toISOString() ?? null,
              }
            : { connected: false }
        }
      />
    </>
  );
}
