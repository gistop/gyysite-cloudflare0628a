# Deployment

This repository supports two deployment modes for the site-builder system itself.

## Linux Docker Compose

The existing deployment remains unchanged. It runs the frontend in nginx and the API in the Express container.

```sh
cp .env.example .env
npm run compose:up
```

This mode keeps the local `/sites/*` publishing target and the Docker volume used by `PUBLISH_ROOT`.

## Cloudflare Pages + Independent Worker

Use this mode when the site-builder system itself should run on Cloudflare.

- Frontend: Cloudflare Pages, built from `dist`.
- Backend: independent Cloudflare Worker from `workers/api.js`.
- The generated-site publishing flow is not redesigned here; the Worker keeps the Cloudflare/GitHub publishing path and disables local disk/OSS-only server targets.

Deploy the API Worker:

```sh
npm run cf:worker:deploy
```

Deploy the Pages frontend:

```sh
npm run cf:pages:deploy
```

Configure Cloudflare Pages with:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://<your-worker-domain>`

Configure the Worker secrets and variables for the features you use:

- `DEEPSEEK_API_KEY`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- R2 variables if asset upload is enabled

The Docker deployment can continue to use same-origin `/api`; the Cloudflare Pages deployment should point `VITE_API_BASE_URL` at the independent Worker.
