## Problem

You're not receiving the 6-digit verification code because email infrastructure was never installed in the backend.

Diagnosis:
- Sign-in form works and Supabase Auth fires the email hook successfully (`Hook ran successfully` in auth logs).
- The auth webhook route (`src/routes/lovable/email/auth/webhook.ts`) tries to enqueue the email into the `auth_emails` queue and log it to `email_send_log`.
- Those tables/queues **don't exist** in the database (`email_send_log`, `pgmq` extension, `pg_cron` — all missing). So every code is silently dropped.
- The sender domain `notify.what2cook.fun` is verified and ready — only the queue/cron plumbing is missing.

## Fix

1. Run the email infrastructure setup. This provisions:
   - `pgmq` queues (`auth_emails`, `transactional_emails`)
   - `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`
   - `enqueue_email` RPC + grants
   - Vault secret for the queue processor
   - `pg_cron` job hitting `/lovable/email/queue/process` every 5s
2. Confirm the cron job is registered and the queue starts draining.
3. Have you request a new code and verify it arrives.

## Notes

- No code changes needed — the webhook + templates are already correctly scaffolded.
- The cron processor only activates once it can reach the deployed preview, so if setup reports "route not ready", the next message will finalize it.
- Production (published site) requires a re-publish afterward so prod cron is provisioned.
