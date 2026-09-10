import Link from "next/link";
import { Globe, Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import { requireUser } from "@/lib/auth";
import { startOfWeekStr, todayInTz, prettyDate } from "@/lib/dates";
import {
  getFriendIds,
  getFriends,
  getLeaderboard,
  getPublicLeaderboardIds,
} from "@/lib/queries";
import { ensureShareCode } from "@/lib/sharecode";
import { kgToDisplay, round } from "@/lib/units";
import FriendManager from "./FriendManager";
import Board from "./Board";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const view = tab === "global" ? "global" : "friends";

  const today = todayInTz(user.timezone);
  const weekStart = startOfWeekStr(today);

  const [shareCode, friends] = await Promise.all([
    ensureShareCode(user.id),
    getFriends(user.id),
  ]);

  const ids =
    view === "global"
      ? await getPublicLeaderboardIds()
      : await getFriendIds(user.id);

  // Always include yourself so you can see your own rank on the public board.
  if (view === "global" && !ids.includes(user.id) && user.publicLeaderboard) {
    ids.push(user.id);
  }

  const entries = await getLeaderboard(ids, user.id, weekStart);

  const rows = entries.map((e) => ({
    ...e,
    volumeDisplay: round(kgToDisplay(e.volumeKgWeek, user.unit) ?? 0, 0),
  }));

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={`Week of ${prettyDate(weekStart)}`}
      />

      <nav className="mb-4 flex gap-1.5" aria-label="Leaderboard view">
        <Link
          href="/leaderboard?tab=friends"
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
            view === "friends"
              ? "border-brand bg-[var(--brand-soft)] text-brand"
              : "border-line bg-surface text-muted"
          }`}
        >
          <Users size={16} /> Friends
        </Link>
        <Link
          href="/leaderboard?tab=global"
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
            view === "global"
              ? "border-brand bg-[var(--brand-soft)] text-brand"
              : "border-line bg-surface text-muted"
          }`}
        >
          <Globe size={16} /> Global
        </Link>
      </nav>

      {view === "friends" ? (
        friends.length === 0 ? (
          <Empty
            title="No friends connected yet"
            hint="Share your code below and add theirs — then you will both show up here and can keep each other honest."
          />
        ) : (
          <Board rows={rows} unit={user.unit} />
        )
      ) : rows.length <= (user.publicLeaderboard ? 1 : 0) ? (
        <Empty
          title="The global board is quiet"
          hint={
            user.publicLeaderboard
              ? "You are on it — as more people opt in, they will appear here ranked by sessions this week."
              : "Opt in below to compare yourself with everyone else who has chosen to appear publicly."
          }
        />
      ) : (
        <Board rows={rows} unit={user.unit} />
      )}

      <p className="mt-3 text-center text-xs text-muted">
        Ranked by sessions trained this week, then total volume. Everyone starts level on Monday.
      </p>

      <div className="mt-6">
        <FriendManager
          shareCode={shareCode}
          friends={friends}
          publicOptIn={user.publicLeaderboard}
        />
      </div>
    </>
  );
}
