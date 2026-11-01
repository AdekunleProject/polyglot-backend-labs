#!/usr/bin/env bash
# End-to-end check: builds the production image, starts mongo + redis + api with
# throw-away random secrets, then calls the real API. Needs Docker and curl.
set -euo pipefail
cd "$(dirname "$0")/.."

rand() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
ENVFILE="$(mktemp)"
PROJECT=mesmoke
ADMIN_PASSWORD="Adm1n-$(rand)"
cat > "$ENVFILE" <<EOT
MONGO_ROOT_USER=smoke
MONGO_ROOT_PASSWORD=$(rand)
REDIS_PASSWORD=$(rand)
JWT_SECRET=$(rand)$(rand)
PAYSTACK_SECRET_KEY=sk_test_smoke
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=$ADMIN_PASSWORD
API_HOST_PORT=13000
MONGO_HOST_PORT=27117
REDIS_HOST_PORT=16379
EOT
# Uncommon host ports, so the smoke test never clashes with a stack you already run.
PORT=13000
cleanup() {
  docker compose -p "$PROJECT" --env-file "$ENVFILE" down -v >/dev/null 2>&1 || true
  rm -f "$ENVFILE"
}
trap cleanup EXIT

fail() { echo "FAIL: $1"; docker compose -p "$PROJECT" --env-file "$ENVFILE" logs api | tail -40; exit 1; }
gql() { curl -sS -X POST "http://127.0.0.1:$PORT/graphql" -H 'Content-Type: application/json' ${2:+-H "Authorization: Bearer $2"} -d "$1"; }

echo "==> starting the stack (first run builds the image)"
docker compose -p "$PROJECT" --env-file "$ENVFILE" up -d --build --wait --wait-timeout 240

echo "==> /health"
curl -fsS "http://127.0.0.1:$PORT/health" | grep -q '"ok"' || fail "/health"
echo "==> /ready (mongo + redis reachable)"
curl -fsS "http://127.0.0.1:$PORT/ready" | grep -q '"ready"' || fail "/ready"

echo "==> bootstrapped admin can log in"
LOGIN=$(gql "{\"query\":\"mutation { loginLocal(input:{username:\\\"admin\\\", password:\\\"$ADMIN_PASSWORD\\\"}) { accessToken role } }\"}")
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "$LOGIN"; fail "admin login"; }

echo "==> a wrong password is rejected"
BAD=$(gql "{\"query\":\"mutation { loginLocal(input:{username:\\\"admin\\\", password:\\\"nope-nope\\\"}) { accessToken } }\"}")
echo "$BAD" | grep -q '"errors"' || fail "wrong password was accepted"

echo "==> broadcastSms without a token is rejected"
NOAUTH=$(gql '{"query":"mutation { broadcastSms(input:{broadcastId:\"b1\", payload:[{phone:\"+2348000000001\", msg:\"hi\"}]}) { success } }"}')
echo "$NOAUTH" | grep -q '"errors"' || fail "unauthenticated broadcast was accepted"

echo "==> broadcastSms with the admin token queues the message"
SMS=$(gql '{"query":"mutation { broadcastSms(input:{broadcastId:\"b1\", payload:[{phone:\"+2348000000001\", msg:\"hi\"}]}) { success count } }"}' "$TOKEN")
echo "$SMS" | grep -q '"count":1' || { echo "$SMS"; fail "broadcast"; }

echo "==> webhook with a bad signature is rejected"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/webhooks/paystack" \
  -H 'Content-Type: application/json' -H 'x-paystack-signature: deadbeef' -d '{"event":"charge.success"}')
[ "$CODE" = "401" ] || fail "webhook returned $CODE, expected 401"

echo
echo "SMOKE TEST PASSED"
