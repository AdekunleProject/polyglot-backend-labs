import { api } from './client';
import type { Product, Review, ReviewPage } from '../types';

export interface ReviewQuery { page?: number; limit?: number; rating?: number }

export const listReviews = (productId: string, q: ReviewQuery = {}) => api.get<ReviewPage>(`/products/${productId}/reviews`, q);
export const createReview = (productId: string, body: { rating: number; comment?: string }) => api.post<Review>(`/products/${productId}/reviews`, body);
export const updateReview = (id: string, body: { rating?: number; comment?: string }) => api.put<Review>(`/reviews/${id}`, body);
export const deleteReview = (id: string) => api.delete(`/reviews/${id}`);
export const replyToReview = (id: string, text: string) => api.post<Review>(`/reviews/${id}/replies`, { text });
export const deleteReply = (id: string, replyId: string) => api.delete<Review>(`/reviews/${id}/replies/${replyId}`);
export const listAllReviews = (q: ReviewQuery = {}) => api.get<ReviewPage>('/reviews', q);

export type SimilarProduct = Product & { similarity: number };
export const visualSearch = (signature: number[]) => api.post<SimilarProduct[]>('/products/visual-search', { signature });
