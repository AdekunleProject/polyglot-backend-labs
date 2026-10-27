# Deploying to Kubernetes

## 1. Create the secret (once per cluster, never stored in Git)

Run from `Ade-projects/e-commerce-backend`, with the real values in your local `.env`.
The MongoDB password is generated fresh each time.

    MONGO_PW=$(openssl rand -hex 16)
    TMP=$(mktemp)
    grep -E '^(JWT_SECRET|JWT_REFRESH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|PAYSTACK_SECRET_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ADMIN_PASSWORD|MAIL_PASS)=' .env > "$TMP"
    kubectl create secret generic ecommerce-secrets \
      --from-literal=MONGO_ROOT_USER=ecommerce \
      --from-literal=MONGO_ROOT_PASSWORD="$MONGO_PW" \
      --from-literal=MONGODB_URI="mongodb://ecommerce:${MONGO_PW}@ecommerce-mongo:27017/ecommerce?authSource=admin" \
      --from-env-file="$TMP"
    rm -f "$TMP"

## 2. Install

    helm install ecommerce helm/ecommerce --set image.tag=<commit-sha> --wait --timeout 5m

## 3. Open it

    kubectl port-forward svc/ecommerce-api 4000:4000
    # http://localhost:4000/docs

## 4. Bad release on purpose, then roll back

    helm upgrade ecommerce helm/ecommerce --set image.tag=thisdoesnotexist --wait --timeout 90s
    kubectl get pods
    helm history ecommerce
    helm rollback ecommerce 1 --wait
