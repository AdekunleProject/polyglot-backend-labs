# DevOps Setup

Docker, CI/CD (GitHub Actions), and Kubernetes for Duka (this frontend) and
the `ecommerce` NestJS backend. Kept cloud-agnostic throughout since the
target cloud wasn't decided yet — swap in your provider's specifics where
noted below.

## What's where

**This repo (frontend):**
- `Dockerfile`, `nginx.conf`, `.dockerignore`
- `.github/workflows/ci-cd.yml`
- `docker-compose.yml` (local dev)
- `k8s/` — all Kubernetes manifests for both frontend and backend

**Backend repo** (uploaded as new files in your Drive, same folders as the
originals — copy them into your actual backend repo):
- `Dockerfile`, `.dockerignore` (backend root)
- `.github/workflows/ci-cd.yml`

## Local development

```bash
docker compose up --build
```

Assumes this frontend and the backend repo are sibling folders (see the
comment at the top of `docker-compose.yml` if yours aren't named
`ecommerce-backend`/`duka-storefront`). This brings up Mongo, the backend
on :4000, and the frontend on :5173 — same ports as running them with
`npm run dev` directly, so nothing else in this repo's docs needs to
change.

## The one gotcha that bites everyone: VITE_API_URL is build-time, not runtime

Vite inlines `import.meta.env.VITE_API_URL` into the JS bundle when you run
`npm run build` — it is **not** read from the environment when the
container starts. Practically:

- Changing an env var on a running frontend container/pod does nothing.
- To point the frontend at a different backend, you rebuild the image with
  a different `--build-arg VITE_API_URL=...` (or the `ARG`/`ENV` pair in
  the Dockerfile, or the `args:` block in `docker-compose.yml`).
- The GitHub Actions workflow reads this from a **repo variable**
  (Settings → Secrets and variables → Actions → Variables tab, not
  Secrets — it's a URL, not sensitive) named `VITE_API_URL`. Set that to
  your deployed backend's URL before the first real deploy.

## CI/CD (GitHub Actions)

Both workflows follow the same shape:
1. **On every push/PR**: install deps, lint, build (backend also runs
   `jest --passWithNoTests` — see the comment in that workflow for why the
   flag is there and when to remove it).
2. **On push to `main` only**: build the Docker image and push it to
   **GHCR** (GitHub Container Registry — `ghcr.io/<owner>/ecommerce-backend`
   and `ghcr.io/<owner>/duka-storefront`). GHCR needs no extra secrets
   beyond the `GITHUB_TOKEN` GitHub already provides automatically.
3. A commented-out `deploy` job template at the bottom of each — needs a
   `KUBE_CONFIG_DATA` secret (base64-encoded kubeconfig) before it'll do
   anything. Getting that kubeconfig is cloud-specific:
   - **AWS (EKS)**: `aws eks update-kubeconfig --name <cluster>` locally,
     then `cat ~/.kube/config | base64` and paste that as the secret.
   - **GCP (GKE)**: `gcloud container clusters get-credentials <cluster>`,
     same base64 step.
   - **Azure (AKS)**: `az aks get-credentials --name <cluster>`, same.
   - **DigitalOcean (DOKS)**: `doctl kubernetes cluster kubeconfig save <cluster>`, same.

   Uncomment the job once that secret exists in your repo.

## Kubernetes

```bash
kubectl create namespace duka   # or just let kustomization.yaml's namespace.yaml do it
kubectl apply -f k8s/secret.example.yaml   # after copying to secret.yaml and filling in real values — see that file's own comments
kubectl apply -k k8s/
```

- Edit `k8s/backend-deployment.yaml` and `k8s/frontend-deployment.yaml` —
  replace `REPLACE_OWNER` with your actual GitHub username/org so the
  image references match what CI actually pushes.
- `k8s/ingress.yaml` uses two hosts (`app.example.com` / `api.example.com`)
  rather than path-based routing, because of the build-time `VITE_API_URL`
  constraint above — replace both with your real domains, and build the
  frontend image with `VITE_API_URL` pointing at whatever you put for the
  API host.
- Requires an ingress controller (ingress-nginx) already installed on the
  cluster — not included here, install separately per your cloud's docs.
- TLS via cert-manager is commented out in `ingress.yaml` — needs
  cert-manager installed and a `ClusterIssuer` configured first.
- `k8s/mongodb-statefulset.yaml` is dev/test only (one replica, no
  backups) — for anything real, use a managed Mongo (Atlas or your cloud's
  managed offering) and put its connection string in `secret.yaml`
  instead. It's excluded from `kustomization.yaml` by default for this
  reason — uncomment only if you're intentionally self-hosting Mongo.
- `k8s/hpa.yaml` (autoscaling) needs the `metrics-server` addon on the
  cluster — most managed clusters have it, check your specific cloud.

## Health checks

Both Dockerfiles' `HEALTHCHECK` and the k8s readiness/liveness probes hit
**real, existing endpoints** — `GET /products` for the backend (public,
unauthenticated, already exists) and `/healthz` for the frontend (added in
`nginx.conf`) — rather than a fabricated `/health` route that doesn't
exist on the backend.
