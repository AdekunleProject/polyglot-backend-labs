variable "region" {
  description = "AWS region for everything in this project"
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "ecommerce-eks"
}

variable "kubernetes_version" {
  description = "Kubernetes version; must be in EKS standard support (extended support costs 6x more)"
  type        = string
  default     = "1.35"
}

variable "node_instance_type" {
  description = "EC2 size for worker nodes"
  type        = string
  default     = "m7i-flex.large"
}

variable "node_count" {
  description = "Number of worker nodes"
  type        = number
  default     = 2
}
