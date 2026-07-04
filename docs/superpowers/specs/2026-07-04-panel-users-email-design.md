# Panel Users And Email Design

## Context

The panel currently has one local JSON-backed account with a username and PIN. The Users page is a "Coming Soon" stub, the topbar labels the signed-in account as a local administrator, and session tokens only identify a generic local account. The login screen includes a "Forgot PIN" action, but it does not send mail.

Outgoing mail will use Resend with `Slutvival <noreply@mail.slutvival.com>`. The Resend dashboard remains the mail-provider control plane. The panel should call Resend only for panel account emails.

## Goals

- Store panel users in SQLite.
- Support roles from the start: `owner`, `admin`, `moderator`, and `viewer`.
- Restrict the real panel to `owner` initially.
- Let non-owner users sign in, view an empty dashboard, manage their own account, and sign out.
- Let the owner create users with username, email, role, and starting PIN.
- Email new users their username and starting PIN.
- Store each user's email on the account and use that stored email for PIN recovery.
- Let users update their own username, email, and PIN from Account settings.
- Keep future RBAC expansion straightforward without designing the full permissions matrix now.

## Non-Goals

- Defining final per-page or per-action permissions for `admin`, `moderator`, and `viewer`.
- Letting non-owner roles manage servers, files, players, settings, users, or backups.
- Letting a reset requester choose the destination email for a reset link.
- Hosting webmail or a custom dashboard at `mail.slutvival.com`.
- Inbound email handling.
- General notification preferences or server alert emails.

## Data Model

Use the existing panel SQLite database path from `SLUTVIVAL_PANEL_DB`, defaulting to `/opt/slutvival/data/slutvival-panel.sqlite`.

Add a `panel_users` table:

- `id text primary key`
- `username text not null unique`
- `email text not null unique`
- `role text not null`
- `pin_salt text not null`
- `pin_hash text not null`
- `pin_reset_token_hash text`
- `pin_reset_expires_at integer`
- `pin_reset_requested_at integer`
- `created_at integer not null`
- `updated_at integer not null`
- `last_login_at integer`

The role column accepts `owner`, `admin`, `moderator`, and `viewer`. PINs continue to use the existing PBKDF2 approach. Reset tokens are stored only as SHA-256 hashes.

## Migration

On first use, migrate the existing JSON auth account into SQLite if no users exist. The migrated account becomes `owner`. Because the JSON account has no email address, the migration should use an owner email from `PANEL_OWNER_EMAIL`.

If `PANEL_OWNER_EMAIL` is missing during migration, the app should keep login unavailable with a clear server-side setup error. It should not silently create an owner without an email, because PIN recovery and user identity depend on stored email addresses.

After a successful migration, the JSON file can remain as historical data but SQLite becomes the source of truth for authentication and account updates.

## Authentication And Sessions

Login authenticates against `panel_users` by username and PIN. Session tokens should carry the signed-in user's id in `sub`, replacing the current generic `"local"` subject. `getSessionAccount` loads the current user from SQLite and returns the user's id, username, email, role, and session expiration.

If a session references a deleted user, it is treated as unauthenticated.

## Access Control

Initial access control is intentionally simple:

- `owner`: full access to the current panel.
- `admin`, `moderator`, `viewer`: access only to `/`, `/account`, login/logout/session APIs, and PIN recovery flows.

The non-owner dashboard should be an empty, low-noise landing view. It should not expose server lists, metrics, settings, files, users, commands, or navigation paths that will fail authorization.

The owner-only sections should remain in the sidebar only for owner sessions. Non-owner sessions should see Account and sign-out affordances, plus the empty dashboard.

API routes that expose server management or platform state should require owner role. UI gating alone is not enough.

## User Management

The Users page becomes owner-only. It lists panel users and provides a create-user form with:

- Username
- Email
- Role
- Starting PIN

When the owner creates a user, the panel stores the user in SQLite and sends a welcome email with the login URL, username, role, and starting PIN. The PIN is shown in the email because the owner intentionally generated it as a starting credential. The panel should encourage the user to change the PIN after first login.

For the initial version, user editing can stay narrow:

- Owner can create users.
- Owner can list users.
- Owner can change another user's role.
- Deleting or disabling users is out of scope for the first version.

The signed-in Account page is the canonical place for users to update their own username, email, and PIN.

## PIN Recovery

Forgot PIN should ask for username or email. The route looks up the account internally, but always returns a generic accepted response for valid requests so it does not reveal whether an account exists.

If a matching account exists, the panel generates a one-time token, stores only its SHA-256 hash, and sends a reset link to the account's stored email address. The requester never chooses the destination address.

Token policy:

- One active reset token per user.
- Token expires after 30 minutes.
- Reset request cooldown is 5 minutes per user.
- Successful reset clears the token immediately.
- Updating the PIN from Account settings clears any active reset token.

The reset page lets the user set a new PIN. After success, the user returns to login and signs in with the new PIN.

## Email

Add a server-only Resend email module. It reads:

```env
RESEND_API_KEY=
PANEL_EMAIL_FROM=Slutvival <noreply@mail.slutvival.com>
PANEL_PUBLIC_URL=https://panel.slutvival.com
PANEL_OWNER_EMAIL=
```

`PANEL_OWNER_EMAIL` is only needed for migration from the legacy JSON account. It is not a global recovery recipient.

Email templates needed for this scope:

- Welcome email for newly created users.
- PIN reset email for existing users.

Provider errors should be surfaced to the owner when creating a user, because a failed welcome email means the user may not receive their starting credentials. PIN recovery send failures should return a clear recovery failure without exposing secrets.

## Resend And DNS Setup

Add `mail.slutvival.com` as a sending domain in Resend. Add the exact DNS records generated by Resend in Cloudflare. Expected record categories are DKIM CNAME records, SPF/return-path records, and a DMARC record for `_dmarc.mail.slutvival.com`.

The implementation must not hard-code Resend-generated DNS hostnames or targets. Those values come from the Resend dashboard.

## Error Handling

Missing or partial email config should produce a setup-oriented error. Login should fail generically for invalid credentials. PIN recovery should return generic accepted responses for unknown users, but it should show configuration or provider failures when recovery cannot be attempted for a real matched user.

Duplicate usernames and duplicate emails should be rejected with clear owner-facing errors on the Users page and Account page.

Non-owner attempts to access owner-only pages or APIs should return redirect or `403` behavior depending on whether the request is a page or API route.

## Testing

Add focused Vitest coverage for:

- SQLite user table migration and bootstrap from legacy JSON account.
- Login by SQLite user id and session lookup by id.
- Owner-only authorization helper behavior.
- Creating users with unique username/email and role validation.
- Welcome email composition.
- PIN reset token creation, hashing, expiration, cooldown, and clearing.
- PIN reset using stored email only.
- Account update changing username/email/PIN for the signed-in user.

Manual verification should include:

- Resend domain verified for `mail.slutvival.com`.
- Production env has `RESEND_API_KEY`, `PANEL_EMAIL_FROM`, `PANEL_PUBLIC_URL`, and `PANEL_OWNER_EMAIL`.
- Legacy owner account migrates into SQLite.
- Owner can create a user and that user receives the welcome email.
- Non-owner user can sign in and only sees the empty dashboard and Account.
- Non-owner cannot access owner-only pages or APIs directly.
- Forgot PIN sends to the stored email and the reset link updates the PIN.
