"use client";

import { FrankieChatPage } from "@frankieai/react";
import { FRANKIE_KEY, getFrankieUserToken } from "@/app/frankie-provider";

export default function ChatPage() {
  if (!FRANKIE_KEY) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6">
        <div className="card text-sm text-muted">
          The assistant is not set up on this deployment. Add NEXT_PUBLIC_FRANKIE_KEY and redeploy
          to turn it on.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FrankieChatPage
        publishableKey={FRANKIE_KEY}
        getUserToken={getFrankieUserToken}
        style={{ height: "100%", minHeight: 0, flex: 1 }}
      />
    </div>
  );
}
