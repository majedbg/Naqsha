# Deployment Guide

## Option 1: Railway (RECOMMENDED — easiest, ~$0/mo)
Railway auto-detects Docker and deploys in one click.
1. Push repo to GitHub
2. Go to railway.app → New Project → Deploy from GitHub repo
3. Railway detects the Dockerfile automatically
4. Add a custom domain or use the free `.railway.app` subdomain
5. Cost: Free tier gives $5/mo credits — enough for a low-traffic static app

## Option 2: Fly.io (Free tier, best global performance)
```bash
npm install -g flyctl
fly auth login
fly launch          # auto-detects Dockerfile, sets region
fly deploy
```
- Free tier: 3 shared-CPU VMs, 256MB RAM — more than enough for nginx serving static files
- Assign a free fly.dev subdomain or bring your own domain

## Option 3: Render (Free static site, no Docker needed)
Since this is a purely static build, Render can serve it without Docker:
1. Push to GitHub
2. render.com → New → Static Site
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Cost: Free forever for static sites

## Option 4: Cloudflare Pages (Free, global CDN, fastest)
Best option — Cloudflare serves from 300+ edge locations:
```bash
npm install -g wrangler
wrangler pages deploy dist --project-name generative-art-studio
```
Or connect GitHub repo in the Cloudflare Pages dashboard:
- Build command: `npm run build`
- Output directory: `dist`
- Cost: Free (unlimited bandwidth on the free plan)

## Option 5: VPS with Docker (cheapest long-term, ~$4/mo)
For a Hetzner CX11 or DigitalOcean Droplet:
```bash
# On the server:
apt update && apt install docker.io docker-compose -y
git clone <your-repo> app && cd app
docker-compose up -d
# Optional: add Caddy or Traefik as a reverse proxy with auto HTTPS
```
Cheapest servers:
- Hetzner CX22: ~€3.29/mo (Europe)
- DigitalOcean Droplet (Basic): $4/mo
- Vultr: $2.50/mo (Tokyo/NJ)

## Recommendation by use case

| Use case | Best option |
|---|---|
| Just want it live fast | Railway or Render |
| Best performance / CDN | Cloudflare Pages |
| Full control + cheap | Hetzner VPS + Docker Compose |
| Need Docker specifically | Fly.io free tier |

## Notes

- All file downloads (SVG export) work from any hosting option since they are client-side only
- No backend, no database, no API keys — fully static client-side app
- Docker image is ~20–30MB (nginx:alpine base + built static files)
- `npm run build` output in `dist/` can also be deployed directly to any static host (S3, GitHub Pages, Netlify) without Docker
