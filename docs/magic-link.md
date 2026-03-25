# Magic Link Authentication

LaunchRadar uses passwordless magic link authentication for email sign-in. When a user enters their email, they receive a link that signs them in with a single click.

## How It Works

1. User enters their email on the login page
2. Backend generates a cryptographically random token (32 bytes), stores it in the `MagicToken` table with a 15-minute expiry
3. An email is sent via Resend containing a link: `https://launchradar.xyz/auth/magic?token=<TOKEN>`
4. User clicks the link in their email
5. Frontend sends the token to `POST /auth/email/verify`
6. Backend verifies the token (not expired, not already used), finds or creates the user by email, creates a session, and sets the session cookie
7. User is redirected to the dashboard

## Security

- Tokens are single-use (marked with `usedAt` timestamp after verification)
- Tokens expire after 15 minutes (configurable via `MAGIC_LINK_EXPIRY_MINUTES`)
- Rate limited: 1 magic link per email per 60 seconds
- `POST /auth/email/send` always returns 200 to prevent email enumeration
- User creation happens on verify, not on send

## Resend Setup

Resend is the email delivery service used to send magic link emails.

### 1. Create a Resend account

Sign up at [resend.com](https://resend.com).

### 2. Get your API key

Go to **API Keys** in the Resend dashboard and create a new key. Add it to your `.env`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
```

### 3. Verify your domain

By default, Resend lets you send from `onboarding@resend.dev` for testing. For production, you need to verify your own domain:

1. Go to **Domains** in the Resend dashboard
2. Click **Add Domain** and enter `launchradar.xyz`
3. Add the DNS records Resend provides:
   - **MX record** (for receiving bounces)
   - **TXT record** (SPF)
   - **CNAME records** (DKIM)
4. Wait for verification (usually a few minutes)

### 4. Configure the sender address

Set the `EMAIL_FROM` env var to your verified sender:

```env
EMAIL_FROM=security@launchradar.xyz
```

> For local development, you can use `onboarding@resend.dev` as the `EMAIL_FROM` without domain verification.

### 5. Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RESEND_API_KEY` | Your Resend API key | (required for email to work) |
| `EMAIL_FROM` | Sender email address | `security@launchradar.xyz` |
| `MAGIC_LINK_EXPIRY_MINUTES` | Token expiry in minutes | `15` |
| `FRONTEND_URL` | Base URL for magic link generation | `http://localhost:5173` |

## API Endpoints

### `POST /auth/email/send`

Send a magic link to the provided email.

**Request:**
```json
{ "email": "user@example.com" }
```

**Response:** Always `200 { "ok": true }` (prevents email enumeration).

### `POST /auth/email/verify`

Verify a magic link token and create a session.

**Request:**
```json
{ "token": "abc123..." }
```

**Response (success):**
```json
{ "user": { "id": "...", "email": "user@example.com", ... } }
```

**Response (failure):** `401 { "error": "Invalid or expired link" }`

## Database

The `MagicToken` model stores pending and used tokens:

```prisma
model MagicToken {
  id        String    @id @default(cuid())
  email     String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([email])
}
```

Old tokens are safe to leave in the database (they're single-use and expired). You can periodically clean them up with:

```sql
DELETE FROM "MagicToken" WHERE "expiresAt" < NOW() - INTERVAL '7 days';
```
