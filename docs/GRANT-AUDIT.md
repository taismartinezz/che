# Grant claims audit — 2026-11-16

Scope: local main checkout at a8cef387f8bc44074f2ef47607fd6ce448cc358a plus the uncommitted changes described below. Source inspection is evidence of implementation, not proof that the same migrations or configuration are deployed.

Production verification is BLOCKED: the managed egress proxy denies CONNECT to `che-inky.vercel.app` with HTTP 403. Chromium returns `ERR_TUNNEL_CONNECTION_FAILED`. Public requests to `/`, `/login`, `/encuesta`, `/encuesta/resultados`, `/terminos`, `/privacidad`, `/hoja-de-ruta` and `/red` all failed before reaching the application. No production login, submission, migration, deployment or user-data access occurred. The user authorized only an aggregate survey-completion count; no administrator session or Supabase binding is available to perform it. Network-domain addition is saved in the environment draft, not applied or published.

“Partial” below includes implemented code whose live behavior could not be checked. No claim is labelled Done on source evidence alone.

| Claim | Status | Code evidence / intended live page | Fix or outstanding check |
|---|---|---|---|
| 1. Post needs and city feed live | Partial | `src/components/CreateRequestDialog.tsx`; `src/pages/Feed.tsx` filters city and subscribes to request changes; `supabase/migrations/20261002000000_schema.sql` requests RLS and realtime publication. `/` | Implemented. Needs two test accounts on an isolated project to verify posting and another browser receiving a city-filtered update; live blocked. |
| 2. Friends and personal invites | Partial | `src/pages/Network.tsx`, `src/components/InviteLink.tsx`, `src/App.tsx` InviteRedeemer; schema RPCs `send_friend_request`, `respond_friend_request`, `accept_invite`. `/red`, `/invite/:code` | Implemented. Live invitation redemption and friendship acceptance unverified. |
| 3. Explained trust ranking | Partial | `20261005000000_recommendation_paths.sql` `get_recommendations`: friend distance, mutuals, exchanges, endorsements, groups, neighbourhood; score capped at 99 and ordered descending. `src/components/RecommendationsDialog.tsx` renders translated reasons. `/pedido/:id` | Implemented. Exchanges include exchanges with the viewer OR their friends; avoid describing all as personal exchanges. Live RPC deployment/output unverified. |
| 4. Mutual introduction and consent before contact | Partial | Schema `get_contact` checks accepted intermediary AND target; latest `request_intro` also validates network path. `src/components/RecommendationsDialog.tsx`, `useOpenWhatsApp.ts`. `/pedido/:id`, `/notificaciones` | Implemented for introductions. Existing friends can already retrieve each other's WhatsApp without a fresh introduction; the broad phrase “contact only after both agree” needs this qualification. Private-contact SELECT grants exclude WhatsApp. Live privacy tests unverified. |
| 5. Thank-you notes and endorsements | Partial | `src/components/ResolveDialog.tsx`, `EndorseDialog.tsx`; schema `resolve_request`, `endorse`, exchanges and endorsements policies. `/pedido/:id`, `/perfil/:id` | Implemented. Live writes and subsequent rendering unverified. |
| 6. Spanish/English; both cities | Partial | `src/i18n/es.ts`, `en.ts`, `index.ts`; `src/lib/constants.ts`; city filters in Feed. | Main app and all new experiment strings bilingual. Legal bodies now have complete English translations, retaining draft notices. Existing survey and survey results contain hardcoded Spanish. Full survey localization remains; cannot claim the entire product is bilingual. |
| 7. Reporting and blocking | Partial | `src/components/ReportDialog.tsx`, `Menu.tsx`, `RequestCard.tsx`; schema `block_user`, reports RLS; `can_contact` and recommendations check blocks. `/perfil/:id`, `/pedido/:id`, `/admin` | Implemented. Existing chat history remains readable after a block; new contact is prevented. Live policies unverified. |
| 8. Care limited to ID/background-checked providers | Partial | `20261003000000_launch_features.sql` verification uploads/admin review; latest recommendations and `request_intro` require `verified AND background_checked`; `VerificationSettings.tsx`. | Found direct offers and completion could bypass this requirement. Added `20261118500000_care_offer_guard.sql` guards on offers/exchanges, filtered care offers and completion choices in UI. Tested guard locally. Migration NOT applied to production. Existing rows and free-form/off-platform agreements are not retroactively certified. |
| 9. Connector, no price setting/employment | Partial | `src/pages/Legal.tsx` section 1; `src/i18n/{es,en}.ts` disclaimer and `ayuda.*` price FAQ. No pre-existing pricing, fee, wage or assignment engine found. | Consistent in inspected code; agreements take the user's exact amount/currency, with no fee or suggested rate. Legal text explicitly remains a draft and needs country-specific review. Live copy unverified. |
| 10. Survey and results with 11 complete responses | Partial | Routes in `src/App.tsx`; `src/pages/encuesta/{Encuesta,Resultados}.tsx`; `20261116000000_encuesta.sql` and subsequent survey migrations. Results compute `respuestas.filter(r => r.completa).length`; access is admin-only. | Pages implemented. **11 is not verified** and must not be asserted from source. An authorized admin can run only `select count(*) from public.encuesta_respuestas where completa = true;` and record timestamp, project and filters. Do not export individual responses. Live routes blocked. |

## Changes prepared locally

- Closed direct-care offer/completion and later category-change bypasses with a new migration; no existing records rewritten. Guard tests include missing identity review, missing background review, approved helpers, and category changes with existing offers/exchanges.
- Roadmap now describes code implementation, conditional notification/verification setup, experiment in development and future payment integration. It does not claim the new experiment is live.
- MVP2 experiment described in `docs/MVP2.md`. No real or Mercado Pago sandbox payment has been processed.

## Validation evidence

- Node 24.22.1, npm 11.9.0. `npm ci --cache /tmp/che-npm-cache --no-audit --no-fund` succeeded with checksum/TLS verification intact. Initial default-cache installation failed; a writable fresh cache resolved it.
- `npm run typecheck` and `npm run build` pass (build reports a nonfatal large-bundle warning).
- `npm run test:mvp2`: 7 passed, 0 failed/skipped. Runs new migrations against local embedded PostgreSQL with minimal auth/profile fixtures. This tests the new SQL, not the full Supabase stack or production migrations.
- Chromium local app: setup screen and legal route render without page errors. Spanish/English mobile experiment UI (mocked HTTP backend) completed a two-actor agreement/receipt/review/share/PDF flow; see `docs/MVP2.md`.

## What must happen before claiming production verification

Apply the saved domain permission in environment settings. Repeat public route checks. Use an isolated Supabase project and two synthetic accounts for functional checks; verify migration history, realtime, consent boundaries, blocks and care eligibility. Production actions or real-user-data access need the user's explicit permission; only the aggregate survey count is authorized. Grant language must omit the number 11 until the count is verified.
