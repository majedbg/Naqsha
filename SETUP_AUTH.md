# Authentication & Backend Setup Guide

This guide walks through setting up Google OAuth, Supabase, and the AI pattern generation backend for the Generative Art Studio.

---

## Prerequisites

- A Google account
- A [Supabase](https://supabase.com) account (free tier works)
- Node.js 20+ and npm
- (Optional) [Supabase CLI](https://supabase.com/docs/guides/cli) for edge function deployment
- (Optional) An [Anthropic API key](https://console.anthropic.com) for AI pattern generation

---

## Step 1: Create a Google OAuth Client

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Select **Web application** as the application type
6. Set the name (e.g. "Generative Art Studio")
7. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (for local development)
   - Your production domain (e.g. `https://generativearts.studio`)
8. Under **Authorized redirect URIs**, add:
   - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`

   You'll get your project ref in the next step.
9. Click **Create** and copy the **Client ID** and **Client Secret**

> **Where to find your Supabase project ref:** It's the subdomain in your Supabase URL. If your URL is `https://abcdefghijk.supabase.co`, the ref is `abcdefghijk`.

---

## Step 2: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a name, set a database password, and select a region close to your users
3. Wait for the project to finish provisioning (~2 minutes)

### Enable Google OAuth Provider

4. In your Supabase dashboard, go to **Authentication → Providers**
5. Find **Google** and enable it
6. Paste the **Client ID** and **Client Secret** from Step 1
7. Click **Save**

### Configure Redirect URLs

8. Go to **Authentication → URL Configuration**
9. Set **Site URL** to your production domain (e.g. `https://generativearts.studio`)
   - For local dev only, you can set this to `http://localhost:5173`
10. Under **Redirect URLs**, add:
    - `http://localhost:5173/auth/callback`
    - `https://generativearts.studio/auth/callback` (your production URL)

### Copy Your API Keys

11. Go to **Settings → API**
12. Copy:
    - **Project URL** (e.g. `https://abcdefghijk.supabase.co`)
    - **anon public** key (starts with `eyJ...`)

---

## Step 3: Run the Database Migrations

1. In your Supabase dashboard, go to **SQL Editor**
2. Open the file `supabase/001_initial_schema.sql` from this repo
3. Paste the entire contents into the SQL editor and click **Run**

   This creates:
   - `profiles` table (auto-created on first sign-in via trigger)
   - `designs` table (cloud save/load with sharing)
   - `design_history` table (Pro version history)
   - `collections` and `collection_designs` tables (Pro folders)
   - `get_shared_design()` RPC function (public share links)
   - All RLS policies and indexes

4. Open `supabase/002_ai_credits.sql` and run it the same way

   This adds:
   - `ai_credits` and `ai_credits_purchased` columns to profiles
   - `ai_patterns` table (stores generated pattern code)
   - `deduct_ai_credits()` and `add_ai_credits()` RPC functions

> **Note:** RLS (Row Level Security) is enabled automatically by the migration. You do NOT need to enable it manually.

---

## Step 4: Configure Environment Variables

Create a `.env` file in the `generative-art-studio/` directory:

```env
VITE_SUPABASE_URL=https://abcdefghijk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_APP_URL=http://localhost:5173
```

Replace the values with your actual Supabase project URL and anon key from Step 2.

> **Security:** The `.env` file is already in `.gitignore`. Never commit it. The anon key is safe to expose client-side — Supabase RLS policies protect all data access.

For production, set `VITE_APP_URL` to your production domain:
```env
VITE_APP_URL=https://generativearts.studio
```

---

## Step 5: Deploy the AI Pattern Edge Function (Optional)

This step is only needed if you want AI pattern generation (the "New Pattern" button in the Pro tier).

### Install the Supabase CLI

```bash
npm install -g supabase
```

### Link your project

```bash
cd generative-art-studio
supabase login
supabase link --project-ref abcdefghijk
```

### Set your Anthropic API key as a secret

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
```

> Get your API key from [console.anthropic.com](https://console.anthropic.com)

### Deploy the function

```bash
supabase functions deploy generate-pattern
```

The edge function uses Claude (`claude-sonnet-4-20250514`) to generate pattern classes. It costs AI credits (12 per new pattern, 4 per revision). Pro users start with 36 credits.

---

## Step 6: Test Locally

```bash
npm install
npm run dev
```

1. Open `http://localhost:5173`
2. Click **Sign in** in the top-right corner
3. You'll be redirected to Google's OAuth consent screen
4. After signing in, you're redirected back to `/auth/callback` which establishes the session
5. Your profile is auto-created in the `profiles` table
6. You should see your avatar and "Free" tier badge

### Verify in Supabase Dashboard

- Go to **Authentication → Users** — your Google account should appear
- Go to **Table Editor → profiles** — a row should exist with your email, display name, and avatar URL

---

## Step 7: Production Deployment

### Static Hosting (Cloudflare Pages, Netlify, Vercel)

1. Set the environment variables in your host's dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL` (your production URL)
2. Build command: `npm run build`
3. Output directory: `dist`
4. **Important:** Configure a catch-all redirect so `/auth/callback` and `/share/:token` route to `index.html`:
   - Netlify: `_redirects` file with `/* /index.html 200`
   - Cloudflare Pages: automatically handles SPA routing
   - Vercel: `vercel.json` with `rewrites` to `index.html`

### Docker

The included `Dockerfile` and `nginx.conf` handle everything:

```bash
docker build -t generative-art-studio .
docker run -p 8080:80 generative-art-studio
```

The nginx config already has `try_files $uri $uri/ /index.html` for SPA client-side routing.

> **Note:** For Docker, environment variables must be set at **build time** (they're baked into the JS bundle by Vite). Pass them as build args or use a `.env` file during the build step.

### Update Google OAuth Redirect URIs

Don't forget to add your production domain's callback URL to both:
- **Google Cloud Console** → Authorized redirect URIs: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
- **Supabase Dashboard** → Authentication → URL Configuration → Redirect URLs: `https://yourdomain.com/auth/callback`

---

## Troubleshooting

### "Sign in" button does nothing
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env`
- Restart the dev server after changing `.env` (Vite requires a restart)

### OAuth redirects to wrong URL
- Verify `VITE_APP_URL` matches where you're running the app
- Check Supabase → Authentication → URL Configuration → Redirect URLs includes your callback URL

### Profile not created after sign-in
- Make sure you ran `001_initial_schema.sql` which includes the `on_auth_user_created` trigger
- Check the Supabase logs (Database → Logs) for trigger errors

### AI pattern generation fails
- Verify the edge function is deployed: `supabase functions list`
- Check the secret is set: `supabase secrets list` (should show `ANTHROPIC_API_KEY`)
- Check edge function logs: `supabase functions logs generate-pattern`

### CORS errors
- The edge function includes `Access-Control-Allow-Origin: *` headers
- If using a custom domain, make sure it's in Supabase's allowed origins

---

## Architecture Overview

```
Browser (Vite + React)
  │
  ├── Supabase Auth (Google OAuth)
  │     └── Redirects to Google → back to /auth/callback
  │
  ├── Supabase Database (PostgreSQL + RLS)
  │     ├── profiles (auto-created on sign-in)
  │     ├── designs (cloud save/load)
  │     ├── design_history (Pro snapshots)
  │     ├── collections (Pro folders)
  │     └── ai_patterns (AI-generated patterns)
  │
  └── Supabase Edge Function (generate-pattern)
        └── Proxies to Claude API (Anthropic)
```

All data access is protected by Row Level Security (RLS). The anon key only grants access that the RLS policies allow. No server-side application code is needed beyond the single edge function for AI generation.
