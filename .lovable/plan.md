## Goals

1. Publish the latest build so `what2cook.fun` serves the current app.
2. Fix the "magic link instead of 6-digit code" issue on the email sign-in flow.

## Why the code isn't arriving

The auth page already calls `signInWithOtp`, which Supabase supports as either a magic link OR a 6-digit code. Which one the user receives is controlled by the **email template** on the auth server, not the client call. The default Lovable/Supabase template embeds `{{ .ConfirmationURL }}` (a link). To send the numeric code, the template must use `{{ .Token }}`.

The fix is to scaffold custom auth email templates for this project and render the OTP token in the magic-link / signup templates. This requires a verified email sender domain.

## Plan

### 1. Set up email sender domain
- Use Lovable's email infrastructure (built-in, no third-party keys).
- Since the user owns `what2cook.fun`, delegate a subdomain like `notify.what2cook.fun` for sending. This is handled by the email setup dialog.

### 2. Scaffold auth email templates
- Generate the 6 auth templates (signup, magic-link, recovery, invite, email-change, reauthentication).
- Edit `magic-link.tsx` and `signup.tsx` to prominently display the 6-digit `{{ token }}` (large, monospace) and remove/de-emphasize the confirmation link, so users enter the code on the existing `/auth` "Enter your code" screen.
- Apply Pantry brand styling (warm gradient header, ChefHat mark, body fonts) to match the app.

### 3. Publish to production
- Verify SEO head tags on `/auth`, `/`, and root are accurate (title, description, OG/Twitter, favicon) — patch any gaps.
- Run a security scan; address criticals if any.
- Publish. The custom domain `what2cook.fun` is already connected, so the new build will serve there once deployment completes (~1 min).

## Notes

- DNS for the email subdomain can take up to 72h to verify; until it does, auth emails fall back to the default Lovable template (still a link). Once verified, the custom OTP-code template takes over automatically.
- No changes needed to `src/routes/auth.tsx` — the client flow is already correct.
