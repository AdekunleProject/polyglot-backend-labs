export interface PaginationOptions {
  skip: number;
  limit: number;
}

export function getPagination(page = 1, limit = 10): PaginationOptions {
  const currentPage = Math.max(1, Number(page) || 1);
  const currentLimit = Math.max(1, Number(limit) || 10);

  return {
    skip: (currentPage - 1) * currentLimit,
    limit: currentLimit,
  };
}

export function getPaginationMeta(total: number, page = 1, limit = 10) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
