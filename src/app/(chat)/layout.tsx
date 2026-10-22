import BottomNav from "@/components/BottomNav";
import { requireUser } from "@/lib/auth";

/**
 * Signed-in pages that fill the screen edge to edge, unlike the padded,
 * width-capped column in (app)/layout.tsx. Stops above the bottom nav.
 */
export default async function FullScreenLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="flex h-dvh flex-col pb-safe">
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <BottomNav />
    </div>
  );
}
