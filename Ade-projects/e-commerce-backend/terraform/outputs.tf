output "default_vpc_id" {
  value = data.aws_vpc.default.id
}

output "default_subnet_ids" {
  value = data.aws_subnets.default.ids
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "configure_kubectl" {
  description = "Run this after apply to point kubectl at the cluster"
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}
