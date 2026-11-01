#!/usr/bin/env bash
# Creates the Kubernetes Secret the Helm chart expects. Nothing is written to Git.
# Usage: PAYSTACK_SECRET_KEY=sk_test_... ADMIN_PASSWORD=... scripts/create-secret.sh [namespace]
set -euo pipefail
NS="${1:-default}"
: "${PAYSTACK_SECRET_KEY:?set PAYSTACK_SECRET_KEY}"
: "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"

rand() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
MONGO_ROOT_USER=marketedge
MONGO_ROOT_PASSWORD="$(rand)"
REDIS_PASSWORD="$(rand)"
JWT_SECRET="$(rand)$(rand)"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<EOT
MONGO_ROOT_USER=$MONGO_ROOT_USER
MONGO_ROOT_PASSWORD=$MONGO_ROOT_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
MONGODB_URI=mongodb://$MONGO_ROOT_USER:$MONGO_ROOT_PASSWORD@marketedge-mongo:27017/marketedge?authSource=admin
JWT_SECRET=$JWT_SECRET
PAYSTACK_SECRET_KEY=$PAYSTACK_SECRET_KEY
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOT
kubectl create secret generic marketedge-secrets -n "$NS" --from-env-file="$TMP" \
  --dry-run=client -o yaml | kubectl apply -f -
echo "Secret marketedge-secrets applied in namespace $NS"
