"use client";

import { usePathname } from "next/navigation";
import { FrankieAgents } from "@frankieai/react";

/**
 * Frankie, the in-app assistant. Mounted once from the root layout; it stays
 * hidden while nobody is signed in, and each agent is off until its key is set.
 */
export default function FrankieProvider() {
  const pathname = usePathname();

  return (
    <FrankieAgents
      productKey={process.env.NEXT_PUBLIC_FRANKIE_KEY}
      supportKey={process.env.NEXT_PUBLIC_FRANKIE_KEY_SUPPORT}
      docsKey={process.env.NEXT_PUBLIC_FRANKIE_KEY_DOCS}
      pathname={pathname}
      getUserToken={async () => {
        const res = await fetch("/api/frankie/token", { method: "POST" });
        if (res.status === 401) return undefined; // nobody is signed in
        if (!res.ok) throw new Error("Frankie token endpoint returned " + res.status);
        return (await res.json()).token;
      }}
    />
  );
}
