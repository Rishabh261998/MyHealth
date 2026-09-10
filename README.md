# MyHealth

> ### 👉 [my-health-rust-beta.vercel.app](https://my-health-rust-beta.vercel.app)
>
> That is the live app. Open it on your phone and add it to your Home Screen.
>
> ---
>
> Want your own copy? Deploying takes about five minutes and costs nothing — see
> [Deploying it](#deploying-it--the-free-question-answered).
>
> **If you own this repository**, import it at
> **[vercel.com/new](https://vercel.com/new)** and pick `MyHealth`. That links the
> deployment to this repo, so every push to `main` ships automatically.
>
> The button below is for *other people* — it copies the repo into a new one of
> their own. Do not use it on your own repository or you will end up with a
> duplicate that your commits never reach.
>
> [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRishabh261998%2FMyHealth&project-name=myhealth&repository-name=myhealth&env=DATABASE_URL,AUTH_SECRET,CRON_SECRET&envDescription=DATABASE_URL%20is%20your%20Postgres%20connection%20string.%20AUTH_SECRET%20and%20CRON_SECRET%20are%20any%20two%20long%20random%20strings.&envLink=https%3A%2F%2Fgithub.com%2FRishabh261998%2FMyHealth%23step-by-step)

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
- **Missed a day? Swap it.** Skipped Monday's push day and want it on Wednesday?
  Tap *Do a different session* and pick it — just for that date. The weekly plan
  stays untouched, and the picker shows which sessions you have not done yet
  this week. Swapping is blocked once you have logged sets, so nothing you did
  can be lost.
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

Two ways, both free:

- **Easiest** — deploy first (step 2), then in your Vercel project go to
  **Storage → Create Database → Neon**. Vercel provisions it and sets
  `DATABASE_URL` for you, then redeploy.
- **Manual** — sign up at [neon.tech](https://neon.tech), create a project, and
  copy the **pooled** connection string (it has `-pooler` in the hostname).

**2. Deploy to Vercel**

Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import
`MyHealth`. Set these environment variables before deploying:

**`DATABASE_URL` is the only variable you have to set**, and creating the
database from Vercel's Storage tab fills it in for you — so in practice there is
nothing to type at all.

Everything else is optional:

| Variable | When you need it |
|---|---|
| `AUTH_SECRET` | Never, unless you want to pin it. Left unset, the app generates a random session secret on first run and keeps it in the database. |
| `CRON_SECRET` | Only to enable scheduled reminders (step 5). |
| `ALLOW_SIGNUP` | Only to close registration, once your account exists. The first account is always allowed regardless, so you cannot lock yourself out. |
| `ANTHROPIC_API_KEY` | Only for AI progress-photo analysis. |

Vercel gives you a public `https://<project>.vercel.app` URL — that is the link
to open on your phone, and the one to paste at the top of this README.

**3. The tables create themselves**

Nothing to do. `npm run build` runs the migrations in `drizzle/` before building,
so the first deploy sets up all 14 tables for you. It is idempotent — later
deploys just check and move on.

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
npm run db:migrate        # create the tables (also runs automatically on build)
npm run dev               # http://localhost:3000
```

Handy scripts:

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:generate` | Generate a new migration after editing `src/db/schema.ts` |
| `npm run db:push` | Push the schema straight to a dev database, no migration file |
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
