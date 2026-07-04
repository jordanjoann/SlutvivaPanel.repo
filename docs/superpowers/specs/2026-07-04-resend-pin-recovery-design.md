# Resend PIN Recovery Design

## Context

The panel has a local username and PIN login. The login screen includes a "Forgot PIN" action, but it currently only shows a placeholder toast. There is no existing email sender, SMTP configuration, mailbox provider, or notification system in the panel.

The desired sender is `Slutvival <noreply@mail.slutvival.com>`. Resend will provide the sending infrastructure and dashboard. The panel only needs enough integration to send PIN recovery emails.

## Requirements

- Use Resend as the transactional email provider.
- Send from `noreply@mail.slutvival.com`.
- Keep `mail.slutvival.com` as a sending domain, not a panel-hosted mail dashboard or webmail app.
- Configure the panel through server-side environment variables only.
- Wire the existing "Forgot PIN" action to send a short-lived reset link.
- Do not expose the Resend API key or recovery tokens to browser code.
- Return generic responses for reset requests so the endpoint does not reveal account details.
- Keep this scoped to PIN recovery. Broader alerts and notification preferences are out of scope.

## Resend And DNS Setup

Create or use a Resend account, then add `mail.slutvival.com` as the sending domain in the Resend dashboard. Resend will generate the exact DNS records to add in Cloudflare. The implementation should not hard-code those values because DKIM names and targets are generated per domain.

The expected DNS work is:

- Add the Resend-provided SPF/return-path records for `mail.slutvival.com`.
- Add the Resend-provided DKIM CNAME records.
- Add a DMARC record for the sending subdomain if one does not already cover it.
- Leave receiving disabled unless a future feature needs inbound mail.
- Skip custom click/open tracking for the initial PIN recovery feature.

After DNS verifies in Resend, create an API key with sending access. If Resend supports domain restriction for the key, restrict it to `mail.slutvival.com`.

## Environment

Add these panel environment variables:

```env
RESEND_API_KEY=
PANEL_EMAIL_FROM=Slutvival <noreply@mail.slutvival.com>
PANEL_RECOVERY_EMAIL=
PANEL_PUBLIC_URL=
```

`PANEL_RECOVERY_EMAIL` is the destination address for PIN recovery messages. The current account model does not store an email address, so a server-side recovery recipient is the smallest safe change.

`PANEL_PUBLIC_URL` is the absolute panel URL used in reset links. If it is missing, the API can fall back to the request origin, but production should set it explicitly.

## Panel Flow

The login page keeps the existing username and PIN form. The "Forgot PIN" button opens a compact recovery action that asks for the username currently being recovered. If the user already typed a username, prefill it.

Submitting the request calls a public unauthenticated API route. The route validates that email recovery is configured, checks the username against the local panel account, and always returns a generic accepted response for well-formed requests. If the username matches, the route generates a one-time token, stores only a hash of it, and sends a reset link to `PANEL_RECOVERY_EMAIL`.

The reset link opens a public reset page with a token query parameter. The page asks for a new PIN and confirmation. Submitting the form calls a reset API route that validates the token, checks expiration, updates the stored PIN through the existing auth boundary, clears the token, and sends the user back to login.

## Token Storage

Use high-entropy random reset tokens. Store only a SHA-256 hash of the token, not the token itself. Store reset metadata as an optional `pinReset` field in the existing auth file so account updates and reset state stay behind the same server auth boundary.

Token policy:

- One active reset token at a time.
- Token expires after 30 minutes.
- Reset request emails are rate-limited with a short cooldown, such as 5 minutes.
- Successful reset clears the token immediately.
- Updating the PIN from the authenticated Account page also clears any active reset token.

## Email Sender

Add a server-only email module that wraps the Resend SDK. It should:

- Read `RESEND_API_KEY` and `PANEL_EMAIL_FROM` from the environment.
- Provide an explicit configuration check used by the recovery route.
- Send both text and simple HTML bodies.
- Return provider errors without leaking secrets.
- Be straightforward to mock in tests.

## Error Handling

Misconfigured email should produce a clear message in the UI because the owner needs to fix setup. Reset requests with unknown usernames should return the same accepted response as known usernames and should not send mail. Expired, missing, or invalid reset tokens should show a reset failure message and allow the user to request another email.

If Resend returns an error while sending, the API should report that recovery email could not be sent. The token should not remain usable unless the message was accepted by Resend.

## Testing

Add focused Vitest coverage for:

- Email configuration detection.
- Reset token creation, hashing, expiration, and clearing.
- Generic response behavior for unknown usernames.
- PIN update through a valid reset token.
- Rejection of expired or invalid reset tokens.
- Clearing recovery state when the PIN is updated through the Account page.

Manual verification should include:

- Resend domain verified for `mail.slutvival.com`.
- API key present in `/opt/slutvival/secrets/slutvival-panel.env`.
- A reset email arrives from `noreply@mail.slutvival.com`.
- The reset link updates the PIN and the old PIN no longer works.

## Out Of Scope

- Hosting a webmail portal at `mail.slutvival.com`.
- Inbound email handling.
- Marketing or broadcast email.
- General notification preferences.
- Server alerts, backup alerts, or player/admin event emails.
