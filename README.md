# Che, ¿conocés?

A mobile-first PWA for Montevideo and Buenos Aires: a trust network for the informal "do you know someone?" economy. People post what they need, and Che recommends people they have a reason to trust (friends, friends of friends, past exchanges, shared groups, same neighbourhood) instead of anonymous star ratings.

Che only connects people. It never sets prices, assigns jobs or employs anyone. The long-term mission is *un puente hacia la formalización*.

**Stack:** React + TypeScript + Vite, Tailwind CSS, Supabase (Postgres, Auth, RLS, Storage, Realtime), React Router, i18next (Rioplatense Spanish by default, plus English), vite-plugin-pwa.

## What works today

| Area | Status |
| --- | --- |
| Email magic link + Google sign-in, onboarding (name, city, neighbourhood, photo, skills, private WhatsApp, Terms and Privacy acceptance) | Available |
| Live feed per city, composer ("Crear pedido"), category filters, search (requests + people) | Available |
| "Ta, te ayudo" offers, with a notification to the author | Available |
| Friend requests, invite links `/invite/:code` (auto-connect), "Tu red", "Personas que quizás conozcas", the "Mi red" graph | Available |
| Trust recommendations (`get_recommendations`, score 0–99 with reasons) | Available |
| Intros via a mutual friend. WhatsApp is shared only after the mutual friend **and** the target accept | Available |
| Resolve a request + thank-you note → exchange. Endorsements between friends | Available |
| **In-app chat** between friends or people with an accepted intro (live, unread badges) | Available |
| **Neighbourhood groups**: create, join, leave, post requests into a group (shared groups add +8 trust) | Available |
| **Share to WhatsApp** (native share sheet on phones, wa.me link on desktop) for requests and invite links | Available |
| **Email + push notifications** via the `notify` Edge Function, with per-user on/off switches | Available once configured (see below) |
| **ID verification + background checks**: private upload, manual admin review, files deleted after the decision. Cuidado only recommends verified people with a reviewed background check | Available |
| Profile, settings, language, dark mode, report, block, delete account, admin page (reports, verifications, pilot metrics) | Available |
| Payments (Mercado Pago), registered-worker badge, automatic invoices | Próximamente (stages 2–3) |

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

### Launch features: what to configure

1. Run `supabase/migrations/20261003000000_launch_features.sql` after the first migration. Then run `supabase/migrations/20261005000000_recommendation_paths.sql`: it lets the author of a request ask a friend to ask around for someone 3 steps away (me → my friend → their friend → them). It adds chat, groups, push subscriptions and verification, and creates the private `verification` storage bucket.
2. **Email + push notifications.** These are sent by the Edge Function in `supabase/functions/notify`.
   1. Generate VAPID keys once with `npx web-push generate-vapid-keys`.
   2. Set the secrets and deploy:
      ```bash
      supabase secrets set WEBHOOK_SECRET=<random string> \
        RESEND_API_KEY=<from resend.com> EMAIL_FROM="Che <avisos@checonoces.com>" \
        VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:hola@checonoces.com \
        APP_URL=https://checonoces.com
      supabase functions deploy notify --no-verify-jwt
      ```
   3. Go to **Database → Webhooks** and create a webhook on `public.notifications`, event `INSERT`. Use the type "Supabase Edge Function" → `notify`, and add the HTTP header `x-webhook-secret: <WEBHOOK_SECRET>`.
   4. Add `VITE_VAPID_PUBLIC_KEY=<public>` to the web app's environment.
   5. In Resend, verify the `checonoces.com` domain so emails don't land in spam.

   Either channel is skipped when its keys are missing. Users turn each one on or off in Configuración → Avisos. Chat messages create at most one notification per sender until it is read, so a conversation doesn't flood the user's inbox or phone.
3. **Verification.** Admins see pending requests in `/admin`. They open each document through a 2-minute signed link, tick "Antecedentes revisados" when the certificate is clear, and approve or reject. The documents are deleted right after the decision. Accepted background certificates are the Policía Nacional one (Uruguay) and the Registro Nacional de Reincidencia one (Argentina).

### Seed data (testing only)

`supabase/seed/seed.sql` adds 7 fictional people per city with skills, friendships, a group, past exchanges and endorsements. It also adds 3 example requests per city (`is_example = true`, shown with an "Ejemplo" tag). Every seed account uses an `@seed.checonoces.test` email and cannot log in.

To see trust scores change, open an invite link to a seed person after you sign up, e.g. `/invite/MARTIN26` (Montevideo) or `/invite/AGUS2026` (Buenos Aires). Martín then becomes your friend, Lucía and Diego become friends of friends, and the rankings update.

### Demo account for presentations (`supabase/seed/demo.sql`)

Use it to show the trust recommendations with your own account, e.g. in the grant interview.

1. Sign up on the site with your account and finish onboarding. Choose Montevideo, or switch to Montevideo with the city button later.
2. Copy your user id from Supabase → **Authentication → Users** (the "UID" column), or run `select id from auth.users where email = 'you@example.com';`.
3. Make sure `seed.sql` has been run, then open `supabase/seed/demo.sql`. Replace the `demo_user` id at the top with yours and run the whole file in the SQL editor.

Your account becomes friends with three fictional seed people: Lucía, Valentina and Camila. Then "Ver a quién conocés" shows:
- on "¿Alguien que sepa configurar una impresora…?": Martín ("Amigo/a de Lucía") and Sofía ("Amigo/a de Camila");
- on "Se me quemó un enchufe de la cocina…": Sofía ("Amigo/a de Camila"), Joaquín ("Amigo/a de Valentina") and Diego ("Más lejos en tu red").

The script only adds friendships between your account and seed people. It refuses to run until you set the id, and running it twice is harmless. To remove it, run `remove_seed.sql`: deleting the seed people also deletes these friendships. Your account and any real friendships stay.

**Before launch, run `supabase/seed/remove_seed.sql`.** It deletes all seed accounts, and everything about them cascades away.

## How privacy is enforced (in the database, not just the UI)

- `profiles.contact_whatsapp` has **no SELECT grant** for signed-in users, so it is unreadable via the API. The only way to read it is the `get_contact()` RPC. It returns a number only to accepted friends, or to the two people in an intro that both the mutual friend and the target accepted.
- Users can't change `is_admin`, `verification_status`, `is_registered_worker` or `invite_code` (column-level grants).
- A profile can't be marked onboarded without `terms_accepted_at` (check constraint).
- Blocks are applied in RLS (feed, profiles) and in the recommendation function, in both directions.
- `cuidado` (babysitting and care): the recommendation function and `request_intro` only allow providers with `verification_status = 'verified'` **and** `background_checked`. Only an admin can set either field, through `admin_review_verification`.
- Chat: `messages` can only be inserted when `can_contact()` is true, i.e. the two people are friends or their intro was accepted by everyone involved, and neither has blocked the other.
- Verification documents live in a private bucket. Only the owner and admins can read them, and they are deleted after review.
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
  migrations/   schema, RLS, RPCs (+ launch features)
  functions/    notify: email (Resend) + web push delivery
  seed/         seed.sql and remove_seed.sql
```

## Deploy (Vercel)

1. Import the repo. Framework preset: Vite. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. `vercel.json` already rewrites client routes to `index.html`.
3. Add the domain **checonoces.com** in Vercel → Domains and point the DNS records at Vercel. Then update the Supabase Site URL.
4. Regenerate the PWA icons if needed with `npm run icons` (requires ImageMagick).

## Before real users (Part 4)

- [ ] A lawyer in each country reviews the Terms, the Privacy Policy and the stored data (Uruguay: Ley 18.331; Argentina: Ley 25.326). The current texts in `src/pages/Legal.tsx` are placeholders.
- [ ] Keep `cuidado` closed to unverified providers. Have the lawyers confirm that storing ID images and criminal-record certificates temporarily, for manual review, is allowed and correctly disclosed.
- [ ] Configure Resend (verified domain), VAPID keys and the database webhook (see "Launch features").
- [ ] Run `remove_seed.sql`.
- [ ] Start the pilot in one neighbourhood per city.
