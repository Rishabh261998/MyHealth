# MyHealth

One place for the gym and the diet: your weekly split, every set you lift, what
you eat, your body weight, progress photos, and phone reminders that nudge you
when it matters.

Built as a mobile-first **PWA** — open it in the browser on your phone, add it to
the Home Screen, and it behaves like an installed app (own icon, full screen,
push notifications).

---

## What it does

**Training**
- A weekly plan you can edit: Push / Pull / Legs / Push / Pull, a Saturday run,
  Sunday rest — 6–7 exercises per day, seeded for you on your first login.
- A workout logger that opens already filled with today's exercises and sets.
- **Shows what you lifted last time** on every exercise, so you always know the
  number to beat. Placeholders pre-fill from that session.
- Autosave while you train, a built-in rest timer, warm-up set marking, RPE,
  reorder / add / remove exercises mid-session.
- A trophy on a set that beats your best estimated 1RM.

**Progress**
- Body-weight chart over 30 days / 3 months / 1 year / all time.
- Per-exercise strength chart: heaviest set and estimated 1RM per session — this
  is the "am I actually adding weight?" answer.
- Weekly training-volume bars, personal-record table, workout streak.
- Every chart has a table view, so the numbers are always readable.

**Diet**
- Log meals with calories and macros; one-tap presets for repeat meals.
- A **junk-food flag** with a weekly budget. Go over it and the app says so — on
  the dashboard and in a push notification.
- Water tracking, daily calorie and protein targets.

**Body & photos**
- Weight, body fat, waist / chest / arm / thigh measurements.
- Progress photos by pose (front / side / back), shrunk on your phone before
  upload and stored in your own database.
- **AI check-in** (optional): Claude looks at one photo, or compares a before and
  after pair, and tells you what visibly changed. It is deliberately cautious —
  it flags when a difference is probably just lighting or pose.

**Reminders**
- Web push to your phone: gym time (naming the day's exercises), morning
  weigh-in, water, meal logging, a Sunday weekly review.
- Context-aware: the gym reminder stays quiet if you already trained, the
  weigh-in reminder stays quiet if you already weighed in.
- Fully editable — time, days of the week, message, which screen it opens.

**Also**
- Journal for sleep, energy and niggles.
- Your own exercise library.
- One-click JSON export of everything. No lock-in.

---

## Deploying it — the free question, answered

**Yes, this runs entirely free.** Nothing here needs a paid plan or a credit card.

| Piece | Service | Free tier | Card needed? |
|---|---|---|---|
| The app | [Vercel](https://vercel.com) Hobby | Unlimited personal projects | No |
| Database | [Neon](https://neon.tech) Free | 0.5 GB Postgres | No |
| Push notifications | Web Push (VAPID) | Free, it is a browser standard | — |
| Reminder scheduler | GitHub Actions | 2,000 min/month (unlimited on public repos) | No |
| AI photo analysis | [Anthropic API](https://console.anthropic.com) | **Optional, pay-as-you-go** — roughly a cent per photo | Yes, if you want this |

Everything except the AI photo check-in is free forever at personal scale. Skip
the API key and every other feature still works.

> Vercel Hobby has its own cron, but on the free plan it only fires **once a
> day** — not enough for hourly reminders. That is why the scheduler below uses
> GitHub Actions, which runs every 15 minutes for free.

### Step by step

**1. Create the database**

Sign up at [neon.tech](https://neon.tech), create a project, and copy the
**pooled** connection string (it has `-pooler` in the hostname).

**2. Deploy to Vercel**

Import this repository at [vercel.com/new](https://vercel.com/new). Before the
first deploy, add these environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon pooled connection string |
| `AUTH_SECRET` | a long random string — `openssl rand -base64 48` |
| `CRON_SECRET` | another long random string |
| `ALLOW_SIGNUP` | `true` for now |

**3. Create the tables**

From a clone of this repo, with `DATABASE_URL` in a local `.env`:

```bash
npm install
npm run db:push
```

**4. Turn on notifications**

```bash
npm run gen:vapid
```

Add the three values it prints (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) to Vercel and redeploy.

**5. Turn on the reminder scheduler**

In this repository: **Settings → Secrets and variables → Actions**, add

- `APP_URL` — e.g. `https://myhealth-yourname.vercel.app`
- `CRON_SECRET` — the same value you gave Vercel

`.github/workflows/reminders.yml` then pokes your deployment every 15 minutes and
it sends whatever is due. (GitHub queues scheduled jobs, so expect a few minutes
of drift — reminders fire if their time landed in the last 45 minutes.)

**6. Make your account, then close the door**

Open the app, create your account, then set `ALLOW_SIGNUP=false` in Vercel and
redeploy so nobody else can register on your instance.

**7. Put it on your Home Screen**

- **Android / Chrome:** menu → *Add to Home screen*.
- **iPhone / Safari:** Share → *Add to Home Screen*. On iOS this step is
  **required** before notifications will work at all (Apple only allows web push
  from an installed PWA, iOS 16.4+).

**8. Optional — the AI photo check-in**

Get a key at [console.anthropic.com](https://console.anthropic.com) and add
`ANTHROPIC_API_KEY` in Vercel. Without it, everything else works and the photo
screen just says the feature is off.

---

## Running it locally

```bash
cp .env.example .env      # fill in DATABASE_URL and AUTH_SECRET
npm install
npm run db:push           # create the tables
npm run dev               # http://localhost:3000
```

Handy scripts:

| Command | What it does |
|---|---|
| `npm run db:push` | Sync the schema to your database |
| `npm run db:studio` | Browse your data in Drizzle Studio |
| `npm run gen:vapid` | Generate web-push keys |
| `npm run gen:icons` | Regenerate the PWA icons |
| `npm run typecheck` | TypeScript check |

---

## How it is built

- **Next.js 15** (App Router, Server Actions) + **React 19** + **TypeScript**
- **Tailwind CSS** — dark and light, follows your phone's setting
- **Drizzle ORM** on **Postgres**
- **Recharts** for the graphs
- **web-push** (VAPID) + a service worker for notifications and an offline shell
- Session cookies signed with `jose`; passwords hashed with scrypt

```
src/
  app/
    (app)/            the signed-in app — dashboard, workout, nutrition,
                      body, photos, progress, plan, notes, settings
    api/              push subscribe/test, reminder cron, data export
    login/            sign in / sign up
  components/         shared UI, including the chart kit
  db/                 Drizzle schema and client
  lib/                auth, dates, units, queries, push, default plan
```

---

## A note on the AI check-in

It reads a photo and describes what changed in training terms. It is not a
medical assessment and not a body-fat measurement — the prompt tells it to hedge
when a difference could just be lighting, angle or pump, and to avoid both. For
anything health-related, talk to a doctor.

## Your data

It lives in your own Neon database. Photos are stored there too, as compressed
JPEGs, never on a third-party image host. **More → Export my data** gives you
everything as JSON whenever you want it.
