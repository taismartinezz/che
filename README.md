# Che, ¿conocés?

A mobile-first PWA for Montevideo and Buenos Aires: a trust network for the informal "do you know someone?" economy. People post what they need, and Che recommends people they have a reason to trust (friends, friends of friends, past exchanges, shared groups, same neighbourhood) instead of anonymous star ratings.

Che only connects people. It never sets prices, assigns jobs or employs anyone. The long-term mission is *un puente hacia la formalización*.

**Stack:** React + TypeScript + Vite, Tailwind CSS, Supabase (Postgres, Auth, RLS, Storage, Realtime), React Router, i18next (Rioplatense Spanish by default, plus English), vite-plugin-pwa.

## What works today

| Area | Status |
| --- | --- |
| Email magic link + Google sign-in, onboarding (name, city, neighbourhood, photo, skills, private WhatsApp, Terms and Privacy acceptance) | ✅ |
| Live feed per city, composer ("Crear pedido"), category filters, search (requests + people) | ✅ |
| "Ta, te ayudo" offers, with a notification to the author | ✅ |
| Friend requests, invite links `/invite/:code` (auto-connect), "Tu red", "Personas que quizás conozcas", the "Mi red" graph | ✅ |
| Trust recommendations (`get_recommendations`, score 0–99 with reasons) | ✅ |
| Intros via a mutual friend. WhatsApp is shared only after the mutual friend **and** the target accept | ✅ |
| Resolve a request + thank-you note → exchange. Endorsements between friends | ✅ |
| Profile, settings, language, dark mode, report, block, delete account, admin page (reports + pilot metrics) | ✅ |
| Roadmap page, coming-soon dialogs, placeholder Terms/Privacy | ✅ |
| In-app chat, email/push, groups, share to WhatsApp, ID verification, payments, registered-worker badge, invoices | 🟠 Próximamente (visible, never faked) |

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Without the env vars, the app shows a setup screen.

## Supabase setup

1. Create a project in the **São Paulo (sa-east-1)** region.
2. In the SQL editor, run `supabase/migrations/20261002000000_schema.sql`. Or use `supabase db push` with the CLI.
   It creates every table with RLS, the RPCs, the realtime publication and the public `avatars` storage bucket.
3. **Auth → Providers:** email is on by default (magic link). To enable **Google**, add your OAuth client id and secret.
4. **Auth → URL configuration:** set the Site URL (e.g. `https://checonoces.com`) and add `http://localhost:5173` to the redirect URLs.
5. Make yourself an admin (SQL editor):
   ```sql
   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
   ```

### Seed data (testing only)

`supabase/seed/seed.sql` adds 7 fictional people per city with skills, friendships, a group, past exchanges and endorsements. It also adds 3 example requests per city (`is_example = true`, shown with an "Ejemplo" tag). Every seed account uses an `@seed.checonoces.test` email and cannot log in.

To see trust scores change, open an invite link to a seed person after you sign up, e.g. `/invite/MARTIN26` (Montevideo) or `/invite/AGUS2026` (Buenos Aires). Martín then becomes your friend, Lucía and Diego become friends of friends, and the rankings update.

**Before launch, run `supabase/seed/remove_seed.sql`.** It deletes all seed accounts, and everything about them cascades away.

## How privacy is enforced (in the database, not just the UI)

- `profiles.contact_whatsapp` has **no SELECT grant** for signed-in users, so it is unreadable via the API. The only way to read it is the `get_contact()` RPC. It returns a number only to accepted friends, or to the two people in an intro that both the mutual friend and the target accepted.
- Users can't change `is_admin`, `verification_status`, `is_registered_worker` or `invite_code` (column-level grants).
- A profile can't be marked onboarded without `terms_accepted_at` (check constraint).
- Blocks are applied in RLS (feed, profiles) and in the recommendation function, in both directions.
- `cuidado` (babysitting and care): the recommendation function and `request_intro` only allow `verification_status = 'verified'` providers. The UI shows the coming-soon verification dialog instead of a list.
- `delete_my_account()` deletes the auth user, and every row cascades. The client first removes the user's avatar files.

## Trust score

Computed in `public.get_recommendations(request_id)` from the viewer's point of view, capped at 99:

| Signal | Points |
| --- | --- |
| Friend / friend of a friend / three steps away | +40 / +25 / +10 |
| Each mutual friend | +6 |
| Each past exchange with you or your friends | +5 |
| A shared group | +8 |
| Each endorsement in the request's category | +2 (max +12) |
| Same neighbourhood as the request | +12 |

## Project layout

```
src/
  components/   TopBar, Layout (3 columns), sidebars, RequestCard, dialogs (create, recommendations, resolve, report, endorse, coming soon)
  pages/        Feed, RequestPage, Network, Profile, Settings, Admin, Roadmap, Login, Onboarding, Legal…
  context/      Auth, UI (theme, city, toasts, coming-soon), Data (network + live notifications)
  i18n/         es.ts (default) and en.ts. All UI text lives here.
  lib/          supabase client, api wrappers, constants (cities, neighbourhoods, categories), errors
supabase/
  migrations/   schema, RLS, RPCs
  seed/         seed.sql and remove_seed.sql
```

## Deploy (Vercel)

1. Import the repo. Framework preset: Vite. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. `vercel.json` already rewrites client routes to `index.html`.
3. Add the domain **checonoces.com** in Vercel → Domains and point the DNS records at Vercel. Then update the Supabase Site URL.
4. Regenerate the PWA icons if needed with `npm run icons` (requires ImageMagick).

## Before real users (Part 4)

- [ ] A lawyer in each country reviews the Terms, the Privacy Policy and the stored data (Uruguay: Ley 18.331; Argentina: Ley 25.326). The current texts in `src/pages/Legal.tsx` are placeholders.
- [ ] Keep `cuidado` closed to unverified providers.
- [ ] Run `remove_seed.sql`.
- [ ] Start the pilot in one neighbourhood per city.
