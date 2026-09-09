import BottomNav from "@/components/BottomNav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-6 pb-safe">
      {children}
      <BottomNav />
    </div>
  );
}
