import { useState } from 'react';
import { LuStar } from 'react-icons/lu';
import * as api from '../../api/reviews';
import { EmptyState, ErrorState, PageLoader, Pager, useAsync } from '../../components/ui';
import { ReviewItem } from '../../components/Reviews';
import { PageHead } from './AdminLayout';

const LIMIT = 10;
export default function Feedback() {
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState(0);
  const list = useAsync(() => api.listAllReviews({ page, limit: LIMIT, rating: rating || undefined }), [page, rating]);

  return (
    <div>
      <PageHead title="Customer feedback" sub="Every rating and comment customers leave arrives here. Edit or remove a comment, reply to the customer, or open the product page to add your own rating." />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by rating">
        {[0, 5, 4, 3, 2, 1].map((n) => (
          <button key={n} aria-pressed={rating === n} onClick={() => { setRating(n); setPage(1); }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${rating === n ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-white hover:border-brand-300'}`}>
            {n === 0 ? 'All ratings' : <>{n} <LuStar className="fill-gold-500 text-gold-500" size={14} /></>}
          </button>
        ))}
      </div>
      {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.data.length ? (
        <EmptyState icon={<LuStar />} title="No feedback yet" text="When a customer rates a product, it shows up here and you get a notification." />
      ) : (
        <div className="space-y-4">
          {list.data.data.map((r) => (
            <ReviewItem key={r._id} review={r} onChanged={list.reload} product={typeof r.product === 'object' ? r.product : undefined} />
          ))}
          <Pager page={list.data.meta.page} pages={list.data.meta.totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
