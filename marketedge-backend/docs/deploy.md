# Deploying MarketEdge to Kubernetes

The image is built and pushed to `ghcr.io/adekunleproject/marketedge-backend:<commit-sha>` by the
GitHub Actions workflow on every push to `master`. Use that commit SHA as the tag.

## 1. Cluster
Reuse the Terraform in `Ade-projects/e-commerce-backend/terraform` (EKS, eu-north-1), or any
cluster. Install metrics-server so the autoscaler can read CPU.

## 2. Secret (never in Git)
```bash
cd ~/polyglot-backend-labs/marketedge-backend
PAYSTACK_SECRET_KEY=sk_test_... ADMIN_PASSWORD='choose-a-strong-one' scripts/create-secret.sh
```
Mongo and Redis passwords and the JWT secret are generated randomly by the script.

## 3. Install
```bash
helm upgrade --install marketedge helm/marketedge --set image.tag=<commit-sha>
kubectl rollout status deployment/marketedge-api
kubectl port-forward svc/marketedge-api 3000:3000
curl http://localhost:3000/ready
```
If the registry package is private, make it public or add an image pull secret.

## Limits to know
- MongoDB and Redis in this chart are demo-grade (one pod, no persistence). Use MongoDB Atlas and a
  managed Redis for real data: point `MONGODB_URI` in the secret and `REDIS_HOST` in `values.yaml` at them.
- The SMS provider is a dry run that logs and sends nothing. Implement `SmsProvider` for a real one.
- This chart has not been installed on a live cluster yet. Run `helm lint helm/marketedge` and a real install before claiming it works.
