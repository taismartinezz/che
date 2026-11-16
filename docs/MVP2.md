# Second MVP — isolated experiment, not deployed

## Implemented, behind flags

A. Agreements in chat: either participant proposes task, date/time, exact amount and UYU/ARS currency; the proposer chooses which person does the work. Both must explicitly accept the immutable proposal. SQL locks the agreement on every transition, prevents direct participant table writes, and prevents nonparticipants from acting. There is no price, fee, wage or job-assignment logic.

Payment is **only a local ledger simulation**, labelled on every experiment view, share view and PDF. A synthetic balance can be marked held only by the client after both accept; both must confirm completion before a simulated receipt is created. There is no network payment adapter, Mercado Pago credential, checkout, capture, escrow or real-money path. This is progress on the workflow, not a working Mercado Pago integration. Do not describe simulated balances as funds securely held by Mercado Pago.

B. Either participant can open a problem on a confirmed agreement and give their account. It freezes completion and clears previous completion confirmations. The first suggested remedy is redoing the work. Both may confirm a successful redo to return to the normal workflow; either may escalate after an unsuccessful attempt. Each participant can add their version. Moderators see escalated cases in `/admin`. Closing mediation does not release a disputed balance; adjudication/refund remains in progress. A closed mediation cannot resume automatic release.

C. Completed test jobs appear at `/antecedentes` for the worker. The agreement and simulated receipt are automatic; the client can add a review. Each participant can download the standalone PDF. The worker may explicitly publish a bearer link and revoke it. Sharing exposes only task, date, amount/currency, simulated receipt and review, not participant identifiers, contacts, messages or dispute statements. Do not put sensitive information in a shared task/review. Sharing is opt-in per job; there is no public worker directory.

All new product text is Spanish/English via `src/i18n/mvp2.ts`. Feature flags default OFF. None of these changes is live.

## Test setup

Use the existing checkout at `/workspace/che`; cloud tasks are isolated, so do not create worktrees unless explicitly requested. Do not connect the experiment to production or use real people/data.

```sh
cd /workspace/che
npm ci --cache /tmp/che-npm-cache --no-audit --no-fund
npm run typecheck
npm run test:mvp2
npm run build
```

The embedded PostgreSQL tests require no credentials or external service. They apply only the two new migrations against synthetic prerequisite fixtures. They do not prove the original Supabase migration chain is installed correctly.

For manual end-to-end testing, first provision an isolated Supabase test project, apply the existing migrations in order, then the care guard and test-agreement migration. This has NOT been executed against any hosted project. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using that test project's public client settings. With service/SQL administration in that isolated project only:

```sql
update public.mvp2_settings set enabled=true, simulation_enabled=true where singleton;
```

Set `VITE_MVP2_ENABLED=true` for Vite and restart. Both synthetic accounts must be friends or have an accepted introduction so `can_contact` permits chat. Open their chat, propose, confirm as both people, simulate payment as client, then confirm completion as both. Try a problem before completion, both versions, redo, failed redo/escalation, and moderation. Never enable against production. SQL settings cannot be changed by anon/authenticated application roles.

Startup:

```sh
cd /workspace/che
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Without Supabase bindings the supported default is the configuration screen; authenticated workflows cannot be validated in that state. For the share page, the frontend flag must also be enabled in the build serving the link. Disable the server flag to hide/disable all experiment access, including bearer links. Individual links can be revoked while the experiment is enabled.

## Remaining work before Mercado Pago sandbox testing

1. Confirm the supported authorized-payment/holding/release model and account capabilities for BOTH Uruguay and Argentina against current Mercado Pago documentation and country-specific agreements. Standard checkout is not evidence of escrow capability.
2. Implement a server-only adapter using test credentials/accounts, rejecting live mode at request and authoritative provider-response level. Do not ship a production credential or real-money endpoint.
3. Verify authenticated, signed provider notifications, amounts/currencies/participants, idempotency, expiry, retries, refunds and reconciliation. A browser redirect must never mark a payment paid/released.
4. Exercise sandbox success, pending, denial, duplicate/out-of-order webhooks, disputes and release failure. Tie receipts to authoritative provider transactions, clearly marked sandbox.
5. Finish mediation resolution/refund policy and its audit requirements; add abuse/rate limiting and operational monitoring. Review the full migration chain and data-retention/sharing policies before even a real-user pilot.
6. Obtain legal review in Uruguay and Argentina before real payments. Any production deploy or interaction with real user data still requires explicit approval.

No attempt is made to fake these prerequisites. Current state: agreement/problem/work-record prototype behind disabled flags; payment integration in progress, not complete.

## Validation completed in this cloud task

- TypeScript and production build pass; seven embedded PostgreSQL/domain/PDF/translation tests pass with no skipped tests.
- Chromium at mobile width exercised the actual agreement component in Spanish and English with two synthetic actors: proposal, both confirmations, simulated funding, both completion confirmations, review, share-link creation and PDF download. The HTTP backend was mocked for this UI check; SQL behavior was tested independently. This is not an end-to-end hosted Supabase test.
- Downloaded PDF was parsed with `pdftotext` and contained the agreement, simulated receipt, review and no-real-money notice. A mobile screenshot was inspected for clipping.
- Live Vercel checks remain blocked by the environment proxy. No external money, user-data writes, hosted migrations or deployments occurred.

## Continuation updates

- Legal bodies now have Spanish/English draft translations, including disclosures about test agreements and opt-in sharing. Survey/results localization remains pending.
- Agreement events are written in the same transaction as each proposal/action. Participant roles can read permitted events but cannot insert, edit or delete them. Earlier dispute accounts remain in history after later replies and redo attempts. Events are not exposed by public share links. History is visible to participants and moderators for escalated cases.
- Care guards reject changing a request into care when existing offers or exchanges include an unverified helper; no existing rows are silently rewritten.
- Shared records refresh every ten seconds and on window focus, hide stale data when navigating between tokens, and distinguish failed loads from unavailable links. Revocation cannot retract downloaded PDFs.
- Additional Chromium checks passed for both legal languages and shared-record navigation, revocation and error handling, with mocked share RPC responses. Live access remains blocked by the unchanged running network policy.
