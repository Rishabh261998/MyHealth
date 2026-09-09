import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysStr, prettyDate } from "@/lib/dates";

export default function DateNav({
  date,
  today,
  basePath,
}: {
  date: string;
  today: string;
  basePath: string;
}) {
  const prev = addDaysStr(date, -1);
  const next = addDaysStr(date, 1);
  const canGoForward = next <= today;

  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-2 py-1.5">
      <Link
        href={`${basePath}?d=${prev}`}
        aria-label="Previous day"
        className="rounded-lg p-2 text-muted"
      >
        <ChevronLeft size={18} />
      </Link>
      <span className="text-sm font-medium">
        {date === today ? "Today" : prettyDate(date)}
      </span>
      {canGoForward ? (
        <Link
          href={`${basePath}?d=${next}`}
          aria-label="Next day"
          className="rounded-lg p-2 text-muted"
        >
          <ChevronRight size={18} />
        </Link>
      ) : (
        <span className="p-2 text-line" aria-hidden>
          <ChevronRight size={18} />
        </span>
      )}
    </div>
  );
}
