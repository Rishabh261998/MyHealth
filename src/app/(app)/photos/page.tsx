import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { photoAnalyses, photos } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { aiConfigured } from "@/lib/ai";
import PhotoStudio from "./PhotoStudio";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);

  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.userId, user.id))
    .orderBy(desc(photos.date), desc(photos.id))
    .limit(60);

  const analyses = await db
    .select()
    .from(photoAnalyses)
    .where(eq(photoAnalyses.userId, user.id))
    .orderBy(desc(photoAnalyses.createdAt))
    .limit(20);

  return (
    <>
      <PageHeader
        title="Progress photos"
        subtitle="The scale lies sometimes. Photos don't."
        back="/more"
      />
      <PhotoStudio
        today={today}
        unit={user.unit}
        photos={rows.map((p) => ({
          id: p.id,
          date: p.date,
          pose: p.pose,
          dataUrl: p.dataUrl,
          weightKg: p.weightKg,
          notes: p.notes,
        }))}
        analyses={analyses.map((a) => ({
          id: a.id,
          photoId: a.photoId,
          comparePhotoId: a.comparePhotoId,
          summary: a.summary,
          createdAt: a.createdAt.toISOString(),
        }))}
        aiEnabled={aiConfigured()}
      />
    </>
  );
}
