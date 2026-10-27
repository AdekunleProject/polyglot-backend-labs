module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = var.cluster_name
  kubernetes_version = var.kubernetes_version

  # Core cluster add-ons: DNS, networking and node proxying
  addons = {
    coredns = {}
    eks-pod-identity-agent = {
      before_compute = true
    }
    kube-proxy = {}
    vpc-cni = {
      before_compute = true
    }
  }

  # Lets kubectl on your laptop reach the cluster API; access still needs IAM login
  endpoint_public_access = true
  enable_irsa            = false

  # Makes the identity running Terraform an admin of the cluster
  enable_cluster_creator_admin_permissions = true

  # Use the default VPC and its subnets (no NAT gateway needed, which saves money)
  vpc_id     = data.aws_vpc.default.id
  subnet_ids = data.aws_subnets.default.ids

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = [var.node_instance_type]

      min_size     = 1
      max_size     = 3
      desired_size = var.node_count
    }
  }

  tags = {
    Project   = "voting-capstone"
    ManagedBy = "terraform"
  }
}
