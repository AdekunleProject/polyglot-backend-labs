# Deploying MarketEdge to AWS EKS

This guide builds a small EKS cluster with Terraform, installs the Helm chart, checks that it
works, rehearses a bad release and rolls it back, then destroys the cluster to stop the cost.

The cluster costs roughly 0.35 USD per hour while it exists. Do not leave it running.

## What you need

- An AWS account and the AWS CLI configured (`aws sts get-caller-identity` should work).
  Use a short-lived access key and delete it when you finish.
- `terraform` (1.5.7 or newer), `kubectl` and `helm`.
- The image from CI. Open the Actions tab, find the latest green `marketedge-backend` run on
  `master`, and copy its commit SHA. The image is `ghcr.io/adekunleproject/marketedge-backend:<sha>`.
- The package must be public, or the cluster cannot pull it. In GitHub: your profile, Packages,
  `marketedge-backend`, Package settings, Change visibility. (Otherwise create an image pull secret.)

## 1. Create the cluster (about 10 minutes)

    cd terraform
    terraform init
    terraform plan
    terraform apply

Read the plan before you type `yes`. It creates about 38 resources in eu-north-1: the EKS control
plane, a managed node group of two `m7i-flex.large` nodes and the add-ons. It uses the default
VPC, so there is no NAT gateway to pay for.

## 2. Point kubectl at it

    aws eks update-kubeconfig --region eu-north-1 --name marketedge-eks
    kubectl get nodes

Both nodes should be `Ready`.

## 3. Install metrics-server

The autoscaler in the chart reads CPU from metrics-server, which EKS does not install by default.

    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    kubectl -n kube-system rollout status deployment/metrics-server

## 4. Create the Secret (never stored in Git)

    cd ..
    PAYSTACK_SECRET_KEY=sk_test_... ADMIN_PASSWORD='choose-a-strong-one' scripts/create-secret.sh

Use a Paystack test key only. MongoDB and Redis passwords and the JWT secret are generated randomly
by the script. Do not paste any of these values into chat or a screenshot.

## 5. Install

    helm upgrade --install marketedge helm/marketedge --set image.tag=<commit-sha> --wait --timeout 5m
    kubectl get pods

All pods (api, mongo, redis) should be `Running` and `Ready`.

## 6. Check it works

    kubectl port-forward svc/marketedge-api 3000:3000

In another terminal:

    curl -i http://localhost:3000/health
    curl -i http://localhost:3000/ready

`/health` says the process is alive. `/ready` also checks MongoDB and Redis. The GraphQL sandbox is
off in production, so test GraphQL with `curl`, for example:

    curl -s http://localhost:3000/graphql -H 'content-type: application/json' \
      -d '{"query":"mutation { loginLocal(input:{username:\"admin\",password:\"YOUR_ADMIN_PASSWORD\"}) { accessToken role } }"}'

## 7. Rehearse a bad release, then roll back

    helm upgrade marketedge helm/marketedge --set image.tag=thisdoesnotexist --wait --timeout 90s
    kubectl get pods
    helm history marketedge
    helm rollback marketedge 1 --wait
    kubectl get pods

The upgrade fails with `ImagePullBackOff`, but the old pods keep serving because the rolling update
(`maxUnavailable: 0`) never removes a working pod until its replacement is ready. The rollback then
restores revision 1.

`scripts/deploy-rehearsal.sh <commit-sha>` runs steps 3 to 7 for you and records a log.

## 8. Destroy it

    helm uninstall marketedge
    cd terraform
    terraform destroy

Then check in the AWS console (EKS and EC2, region eu-north-1) that the cluster and nodes are gone,
and delete the AWS access key you used.

## Limits to know

- MongoDB and Redis in this chart are demo-grade: one pod each, data in an `emptyDir`, lost if a pod
  restarts. For real data use MongoDB Atlas and a managed Redis, and point `MONGODB_URI` in the
  Secret and `REDIS_HOST` in `values.yaml` at them.
- The SMS provider is a dry run that logs and sends nothing.
- Email needs `SMTP_USER` and `SMTP_PASS`; without them verification emails will fail and retry.
- Status: write the date of your first successful install here once you have done it, and do not
  claim a live deployment before then.
