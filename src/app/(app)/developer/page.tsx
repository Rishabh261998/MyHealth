import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import DeveloperPanel from "./DeveloperPanel";

export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const user = await requireUser();
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))
    .orderBy(desc(apiKeys.createdAt));

  return (
    <>
      <PageHeader
        title="Developer / API"
        subtitle="Personal API keys for your own data"
        back="/more"
      />
      <DeveloperPanel
        keys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          scopes: k.scopes,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revoked: k.revokedAt != null,
          createdAt: k.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
