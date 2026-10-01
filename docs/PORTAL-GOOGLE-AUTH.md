# Portal login — Google OAuth (Supabase)

## 1. Supabase Dashboard

**Authentication → Providers → Google**

1. Enable **Google**.
2. You need a **Google Cloud OAuth client** (Web application).

## 2. Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID → Web application**.
3. **Authorized redirect URIs** — add **exactly** (replace project ref):

   `https://ijaseteczrguoforksbl.supabase.co/auth/v1/callback`

4. Copy **Client ID** and **Client secret** into Supabase Google provider.

## 3. Supabase URL configuration

**Authentication → URL configuration**

| Setting | Value |
|---------|--------|
| **Site URL** | `https://aftertentransfers.app` |
| **Redirect URLs** | `https://aftertentransfers.app/auth/callback` |
| | `https://aftertentransfers.app/**` (optional; covers misrouted OAuth) |
| | `http://localhost:3000/auth/callback` |

If Google sends you to `https://aftertentransfers.app/?code=...`, the portal forwards that to `/auth/callback`. You still need a **Next.js** Vercel deploy (not the old static placeholder).

## 4. Email login

**Authentication → Providers → Email** — enabled.

Create users under **Authentication → Users** (or invite) for email/password sign-in.

## 5. Vercel env

Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Never** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel for the portal.

## 6. Local dev

```powershell
cd afterten-orders
copy .env.local.example .env.local
# fill keys
npm install
npm run dev
```

Open http://localhost:3000/login
