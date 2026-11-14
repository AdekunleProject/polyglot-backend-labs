#!/usr/bin/env bash
# Installs MarketEdge on the EKS cluster, checks it, rehearses a bad release and rolls it back.
# Usage: PAYSTACK_SECRET_KEY=sk_test_... ADMIN_PASSWORD=... scripts/deploy-rehearsal.sh <commit-sha>
# Needs kubectl pointed at the marketedge-eks cluster, plus helm and curl. Writes deploy-rehearsal.log.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:?usage: scripts/deploy-rehearsal.sh <commit-sha>}"
: "${PAYSTACK_SECRET_KEY:?set PAYSTACK_SECRET_KEY (a sk_test_ key)}"
: "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"
case "$PAYSTACK_SECRET_KEY" in sk_test_*) ;; *) echo "Refusing: use a sk_test_ key, never a live key."; exit 1;; esac
for t in kubectl helm curl; do command -v "$t" >/dev/null || { echo "Missing tool: $t"; exit 1; }; done

CTX="$(kubectl config current-context)"
case "$CTX" in *marketedge-eks*) ;; *) echo "Refusing: kubectl context is '$CTX', not marketedge-eks."; exit 1;; esac

exec > >(tee deploy-rehearsal.log) 2>&1
echo "== $(date -u +%FT%TZ)  context: $CTX  image tag: $TAG"

check() {
  kubectl port-forward svc/marketedge-api 3000:3000 >/dev/null 2>&1 &
  local pf=$!
  sleep 5
  echo "-- /health"; curl -fsS http://localhost:3000/health; echo
  echo "-- /ready";  curl -fsS http://localhost:3000/ready; echo
  kill "$pf" 2>/dev/null || true
  wait "$pf" 2>/dev/null || true
}

echo "== 1. metrics-server (needed by the autoscaler)"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl -n kube-system rollout status deployment/metrics-server --timeout=180s

echo "== 2. Secret"
scripts/create-secret.sh

echo "== 3. Install"
helm upgrade --install marketedge helm/marketedge --set image.tag="$TAG" --wait --timeout 5m
kubectl get pods
check

GOOD="$(helm list --filter '^marketedge$' | awk 'NR==2{print $3}')"
echo "Last good revision: $GOOD"

echo "== 4. Bad release on purpose (expected to fail)"
if helm upgrade marketedge helm/marketedge --set image.tag=thisdoesnotexist --wait --timeout 90s; then
  echo "Unexpected: the bad release succeeded."; exit 1
else
  echo "Bad release failed as expected."
fi
kubectl get pods
helm history marketedge

echo "== 5. Roll back to revision $GOOD"
helm rollback marketedge "$GOOD" --wait
kubectl get pods
helm history marketedge
check

echo "== Done. Destroy the cluster now: helm uninstall marketedge && (cd terraform && terraform destroy)"
