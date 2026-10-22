import Link from "next/link";
import {
  BookOpen,
  Trophy,
  CalendarDays,
  Camera,
  Download,
  Dumbbell,
  LogOut,
  MessageCircle,
  Code2,
  Moon,
  Scale,
  Settings,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

const LINKS = [
  { href: "/chat", label: "Chat", hint: "Ask the assistant about your data", icon: MessageCircle },
  { href: "/plan", label: "Weekly plan", hint: "Your split, day by day", icon: CalendarDays },
  { href: "/body", label: "Body metrics", hint: "Weight, body fat, measurements", icon: Scale },
  { href: "/photos", label: "Progress photos", hint: "Timeline and AI check-ins", icon: Camera },
  { href: "/notes", label: "Journal", hint: "Sleep, energy, niggles", icon: BookOpen },
  { href: "/recovery", label: "Recovery", hint: "Oura, Apple Watch, sleep & HRV", icon: Moon },
  { href: "/exercises", label: "Exercises", hint: "Your exercise library", icon: Dumbbell },
  { href: "/leaderboard", label: "Leaderboard", hint: "Friends and global rankings", icon: Trophy },
  { href: "/settings", label: "Settings", hint: "Goals, units, reminders", icon: Settings },
  { href: "/developer", label: "Developer / API", hint: "API keys for third-party access", icon: Code2 },
];

export default async function MorePage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="More" subtitle={user.email} />

      <ul className="space-y-2">
        {LINKS.map(({ href, label, hint, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5"
            >
              <Icon size={20} className="shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{label}</p>
                <p className="text-xs text-muted">{hint}</p>
              </div>
              <span className="text-muted">→</span>
            </Link>
          </li>
        ))}
        <li>
          <a
            href="/api/export"
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5"
          >
            <Download size={20} className="shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Export my data</p>
              <p className="text-xs text-muted">Everything as a JSON file</p>
            </div>
            <span className="text-muted">↓</span>
          </a>
        </li>
      </ul>

      <form action={logout} className="mt-6">
        <button type="submit" className="btn-ghost w-full">
          <LogOut size={16} /> Log out
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        MyHealth · your data lives in your own database
      </p>
    </>
  );
}
