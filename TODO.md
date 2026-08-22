# What 2 Cook — TODO & deferred work

Last updated: 2026-08-22

Live: https://what2cook.today
Vercel project: `dl-projejct/what2cook`
Supabase project: `zaphtafleaczpopjzsas` (your own — **not** the old Lovable one)

---

## 🔴 Blocking — do this next

### Run the `email_interest` migration  ← ONLY REMAINING BLOCKER
File: `supabase/migrations/20260820120000_email_interest.sql`
Paste into https://supabase.com/dashboard/project/zaphtafleaczpopjzsas/sql/new and Run.

**Confirmed missing as of 2026-08-20 evening** — a real `SELECT` returns
`PGRST205: Could not find the table 'public.email_interest'`. Until this runs, every
"Continue with email" attempt shows the popup correctly but **records nothing**.

Creates the table + `record_email_interest()` RPC. The admin Overview panel shows a red
warning while the table is missing, and flips to the real list automatically once it exists.

> Gotcha for future checks: `.select("id", { head: true, count: "exact" })` returns **no
> error** against a missing table — it silently reports success. Always verify a table
> exists with a plain `.select()`.

---

## 🟡 Deferred — decided, not forgotten

### Custom SMTP for non-Google email sign-in
**Status:** deliberately deferred 2026-08-20. Interim gate is live and measuring demand.

**Why deferred:** Supabase's built-in email service is testing-only and blocks all three
things at once —

| Problem | Cause |
|---|---|
| Sends a sign-in *link*, not a 6-digit code | Templates are read-only without custom SMTP |
| Sender says "Supabase", not "What 2 Cook" | Built-in service sends from a Supabase address |
| "Email rate limit exceeded" | ~2–4 emails/hour **project-wide** (not per address) |

That rate limit alone makes email sign-in unusable for real users — 3–4 signups in an hour
locks out everyone after them.

**Interim solution (shipped):** non-Google emails hit a popup explaining email sign-in
isn't ready, promising notification, and pointing at Google. No email is sent, so the rate
limit is never triggered. Each attempt is recorded (deduped by address, with an attempt
counter) and surfaces on the admin dashboard as the **"Want email sign-in"** card.

**Decision rule:** let the counter run a few weeks.
- Stays near zero → Google-only is genuinely enough, skip the work entirely.
- Climbs → do the setup, and you already have a list of people to notify.

**When you do it (~1 hour, mostly DNS):**
1. Sign up at resend.com (free tier: 3,000/month, 100/day)
2. Add domain `what2cook.today`, paste the SPF/DKIM records at GoDaddy
   (same place as the Vercel A record `76.76.21.21`)
3. Copy Resend's SMTP credentials → Supabase → Authentication → SMTP Settings
4. The "Set up custom SMTP to edit templates" banner disappears; edit the **Magic Link**
   template to show `{{ .Token }}` instead of `{{ .ConfirmationURL }}`
5. Set sender name to "What 2 Cook" / `noreply@what2cook.today`
6. Raise the cap under Authentication → **Rate Limits** (defaults conservatively ~30/hr)
7. Re-enable the real OTP flow in `src/routes/auth.tsx` — the popup currently replaces
   `signInWithOtp`; git history has the original two-step code-entry UI
8. Notify everyone in the `email_interest` table

**Alternative considered:** more OAuth providers (Apple covers iCloud users, Microsoft
covers Outlook/Hotmail) — no email infrastructure at all, but Apple requires a paid
developer account ($99/yr). Complement, not a substitute — some people still expect
plain email.

### GitHub push access
**Status:** unresolved, low urgency — Vercel deploys go straight from local, no GitHub needed.

Remote is `github.com/Testbillionaire/cook-easy-guide`, but this machine's `gh` CLI is
authenticated as **Happyachiever**, which has no write access → every push 403s. Local
commits are not backed up anywhere.

Options: add Happyachiever as a collaborator · re-auth as Testbillionaire ·
or push to a fresh repo under an account you fully control (also cuts the last tie to the
Lovable-linked repo).

---

## 🟢 Cosmetic cleanup — harmless, whenever

- Delete `.lovable/` (Lovable IDE bookkeeping, unused)
- `README.md` still describes the Lovable editor workflow and the old `*.lovable.app` URL
- `src/routes/__root.tsx` — `og:image` / `twitter:image` point at Lovable's R2 preview CDN;
  swap for a self-hosted image (affects link previews when sharing the site)
- `src/routes/index.tsx:42` — stale comment about Lovable's sandboxed preview iframe
- `src/routes/lovable/email/**` — dead routes still importing `@lovable.dev/*` packages.
  Not reachable, but they're why `@lovable.dev/email-js` and `@lovable.dev/webhooks-js`
  are still in `package.json`. Safe to delete along with those deps.
- `src/lib/email-templates/*.tsx` — React Email templates built for the old Lovable send
  flow. **Note:** these are *not* used by Supabase SMTP (Supabase renders its own
  dashboard templates), so they stay orphaned even after the SMTP work above.

---

## ✅ Recently completed (2026-08-18 → 2026-08-20)

- Moved project out of a temp scratchpad → `/Users/aa/Developer/what2cook.today` (git history
  intact; the folder was briefly named `W2C` before being renamed on 2026-08-22)
- Deployed to Vercel independently of GitHub; custom domain `what2cook.today` live
- **Full cutover from Lovable's Supabase project to your own** (`zaphtafleaczpopjzsas`):
  consolidated schema, env vars, Google OAuth re-done on the correct project
- Google sign-in working end-to-end in production
- Fixed: "Ingredients" breadcrumb was disabled on the pick step — now always returns to
  the search page from anywhere in the flow
- Added: **Servings 1 / 2 / 3-4** selector on recipe detail, scales ingredient quantities
  (recipe-as-written treated as the 3-4 baseline)
- Rebranded "Pantry" → "What 2 Cook" across all page titles and headers
- Email sign-in gated behind an explanatory popup + demand counter
- `SUPABASE_SERVICE_ROLE_KEY` pushed to all 3 Vercel environments (Sensitive on
  Production/Preview); other 4 vars checksum-verified against local. Fixed a whole class
  of silent production failures — analytics, saved recipes, profile, `/admin`
- Admin role granted to the primary account; verified via the same `has_role` RPC the app
  uses to gate `/admin`
- Admin Overview: added a "Want email sign-in" KPI + a "Waiting for email sign-in" panel
  listing addresses with attempt counts and a Copy-all button
