"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { sendTestPush, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";

export default function NotificationSettings({ configured }: { configured: boolean }) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator)) return setSubscribed(false);
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (!cancelled) setSubscribed(Boolean(sub));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(done);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Notifications</h2>

      {!configured ? (
        <p className="text-sm text-muted">
          Push is not configured on this deployment. Run <code>npm run gen:vapid</code> and add the
          two keys it prints as environment variables, then redeploy.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {subscribed
              ? "This device is signed up for reminders."
              : "Turn on reminders for this device. On iPhone, add the app to your Home Screen first."}
          </p>

          <div className="flex flex-wrap gap-2">
            {subscribed ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await unsubscribeFromPush();
                    setSubscribed(false);
                  }, "Reminders turned off for this device.")
                }
                className="btn-ghost h-9 text-xs"
              >
                <BellOff size={14} /> Turn off
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await subscribeToPush();
                    setSubscribed(true);
                  }, "This device will now get reminders.")
                }
                className="btn-primary h-9 text-xs"
              >
                <Bell size={14} /> Turn on
              </button>
            )}

            <button
              type="button"
              disabled={busy || !subscribed}
              onClick={() =>
                run(async () => {
                  const res = await sendTestPush();
                  if (res.sent === 0) throw new Error("No devices are subscribed yet.");
                }, "Test notification sent.")
              }
              className="btn-ghost h-9 text-xs"
            >
              <Send size={14} /> Send a test
            </button>
          </div>
        </>
      )}

      {message && <p className="text-sm text-muted">{message}</p>}
    </section>
  );
}
