import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCornerDownRight, LuMessageSquare, LuPencil, LuStar, LuTrash2 } from 'react-icons/lu';
import * as api from '../api/reviews';
import { errorMessage } from '../api/client';
import { Alert, EmptyState, ErrorState, Modal, PageLoader, Pager, Spinner, useAsync } from './ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { dateShort, ROLE_LABEL, isStaff, positivePercent, ratingBand } from '../lib/format';
import type { Review } from '../types';

export function Stars({ value, size = 16, className = '' }: { value: number; size?: number; className?: string }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  const row = (cls: string) => <span className={`flex gap-0.5 ${cls}`}>{[0, 1, 2, 3, 4].map((i) => <LuStar key={i} size={size} className="shrink-0 fill-current" />)}</span>;
  return (
    <span role="img" aria-label={`${value.toFixed(1)} out of 5 stars`} className={`relative inline-flex ${className}`}>
      {row('text-line')}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>{row('text-gold-500')}</span>
    </span>
  );
}

export function StarInput({ value, onChange, size = 28 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="inline-flex gap-1" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onChange(n)}
          className={`rounded p-0.5 transition hover:scale-110 ${n <= shown ? 'text-gold-500' : 'text-line'}`}>
          <LuStar size={size} className="fill-current" />
        </button>
      ))}
    </div>
  );
}

export function RatingBand({ count, positive, className = '' }: { count?: number; positive?: number; className?: string }) {
  const band = ratingBand(count, positive);
  if (!band) return null;
  return band === 'excellent'
    ? <span className={`font-bold text-emerald-600 ${className}`} title={`${positivePercent(count, positive)}% of buyers rated it 4 or 5 stars`}>Excellent</span>
    : <span className={`font-bold text-amber-600 ${className}`} title={`${positivePercent(count, positive)}% of buyers rated it 4 or 5 stars`}>Good</span>;
}

export function RatingLine({ average, count, positive, className = '' }: { average?: number; count?: number; positive?: number; className?: string }) {
  if (!count) return <p className={`text-xs text-mute ${className}`}>No reviews yet</p>;
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs ${className}`}>
      <Stars value={average ?? 0} size={13} />
      <span className="font-semibold text-ink">{(average ?? 0).toFixed(1)}</span>
      <span className="text-mute">({count})</span>
      <RatingBand count={count} positive={positive} />
    </p>
  );
}

const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function ReviewItem({ review, onChanged, product }: { review: Review; onChanged: () => void; product?: { _id: string; name: string } }) {
  const { user } = useAuth();
  const toast = useToast();
  const staff = isStaff(user?.role);
  const mine = user?.id === review.user;
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(review.rating);
  const [comment, setComment] = useState(review.comment);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true); setErr('');
    try { await fn(); toast.success(done); after?.(); onChanged(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const save = () => run(() => api.updateReview(review._id, { rating, comment }), 'Review updated', () => setEditing(false));
  const remove = () => run(() => api.deleteReview(review._id), 'Review deleted', () => setConfirm(false));
  const sendReply = () => { if (!reply.trim()) return; return run(() => api.replyToReview(review._id, reply.trim()), 'Reply posted', () => { setReply(''); setReplying(false); }); };

  return (
    <article className="card-pad">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">{initials(review.authorName)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-semibold">{review.authorName}</p>
            {review.authorRole !== 'customer' && <span className="badge-violet">{ROLE_LABEL[review.authorRole]}</span>}
            <span className="text-xs text-mute">{dateShort(review.createdAt)}{review.edited ? ' · edited' : ''}</span>
          </div>
          {product && <p className="mt-0.5 text-xs text-mute">on <Link className="font-semibold text-brand-600 hover:underline" to={`/product/${product._id}`}>{product.name}</Link></p>}

          {editing ? (
            <div className="mt-3 space-y-3">
              <StarInput value={rating} onChange={setRating} size={24} />
              <textarea className="field min-h-20" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Edit comment" />
              {err && <Alert>{err}</Alert>}
              <div className="flex gap-2"><button className="btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? <Spinner /> : 'Save'}</button><button className="btn-ghost btn-sm" onClick={() => { setEditing(false); setRating(review.rating); setComment(review.comment); }}>Cancel</button></div>
            </div>
          ) : (
            <>
              <Stars value={review.rating} size={16} className="mt-2" />
              {review.comment && <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink/80">{review.comment}</p>}
            </>
          )}

          {review.replies.map((r) => (
            <div key={r._id} className="mt-3 flex gap-2 rounded-xl bg-brand-50/70 p-3 text-sm">
              <LuCornerDownRight className="mt-0.5 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-brand-700">{r.authorName} · {ROLE_LABEL[r.authorRole]} <span className="font-normal text-mute">{dateShort(r.createdAt)}</span></p>
                <p className="mt-0.5 whitespace-pre-line break-words">{r.text}</p>
              </div>
              {staff && <button aria-label="Delete reply" className="text-mute hover:text-rose-600" onClick={() => run(() => api.deleteReply(review._id, r._id), 'Reply removed')}><LuTrash2 size={15} /></button>}
            </div>
          ))}

          {replying && (
            <div className="mt-3 space-y-2">
              <textarea className="field min-h-16" maxLength={1000} placeholder="Write a reply that the customer will see" value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" />
              <div className="flex gap-2"><button className="btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={sendReply}>Post reply</button><button className="btn-ghost btn-sm" onClick={() => setReplying(false)}>Cancel</button></div>
            </div>
          )}
          {!editing && err && <div className="mt-3"><Alert>{err}</Alert></div>}

          {!editing && (mine || staff) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <button className="inline-flex items-center gap-1 text-mute hover:text-brand-600" onClick={() => setEditing(true)}><LuPencil size={13} /> Edit</button>
              <button className="inline-flex items-center gap-1 text-mute hover:text-rose-600" onClick={() => setConfirm(true)}><LuTrash2 size={13} /> Delete</button>
              {staff && <button className="inline-flex items-center gap-1 text-mute hover:text-brand-600" onClick={() => setReplying((v) => !v)}><LuMessageSquare size={13} /> Reply</button>}
            </div>
          )}
        </div>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete this review?">
        <p className="text-sm text-mute">The rating and comment from {review.authorName} will be removed and the product's average will update.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-danger" disabled={busy} onClick={remove}>Delete review</button></div>
      </Modal>
    </article>
  );
}

export function ReviewSection({ productId, onSummary }: { productId: string; onSummary?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(0);
  const data = useAsync(() => api.listReviews(productId, { page, limit: 5, rating: filter || undefined }), [productId, page, filter]);
  const mineQ = useAsync(async () => {
    if (!user) return null;
    const r = await api.listReviews(productId, { limit: 50 });
    return r.data.find((x) => x.user === user.id) ?? null;
  }, [productId, user?.id, data.data?.summary?.count]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const changed = () => { data.reload(); mineQ.reload(); onSummary?.(); };
  const submit = async () => {
    if (!rating) { setErr('Choose a star rating first.'); return; }
    setBusy(true); setErr('');
    try { await api.createReview(productId, { rating, comment: comment.trim() || undefined }); toast.success('Thanks. Your review is live and the store has been told.'); setRating(0); setComment(''); changed(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  const sum = data.data?.summary;
  const hasMine = !!mineQ.data;

  return (
    <section id="reviews" className="mt-16 scroll-mt-24">
      <h2 className="font-display text-2xl font-extrabold">Ratings and comments</h2>
      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <div className="card-pad">
            {sum && sum.count > 0 ? (
              <>
                <div className="flex items-end gap-3"><p className="font-display text-5xl font-extrabold">{sum.average.toFixed(1)}</p><p className="pb-1.5 text-sm text-mute">out of 5</p></div>
                <Stars value={sum.average} size={20} className="mt-2" />
                <p className="mt-1 text-sm text-mute">{sum.count} rating{sum.count === 1 ? '' : 's'} · <RatingBand count={sum.count} positive={sum.breakdown['4'] + sum.breakdown['5']} /> ({positivePercent(sum.count, sum.breakdown['4'] + sum.breakdown['5'])}% positive)</p>
                <div className="mt-4 space-y-1.5">
                  {([5, 4, 3, 2, 1] as const).map((n) => {
                    const c = sum.breakdown[String(n) as '1'];
                    return (
                      <button key={n} onClick={() => { setFilter(filter === n ? 0 : n); setPage(1); }} aria-pressed={filter === n}
                        className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition hover:bg-brand-50 ${filter === n ? 'bg-brand-50 ring-1 ring-brand-200' : ''}`}>
                        <span className="w-12 shrink-0 whitespace-nowrap text-left font-semibold">{n} star</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-gold-500" style={{ width: `${(c / sum.count) * 100}%` }} /></span>
                        <span className="w-6 text-right tabular-nums text-mute">{c}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : <p className="text-sm text-mute">No ratings yet. Be the first to rate this product.</p>}
          </div>

          <div className="card-pad">
            {!user ? (
              <p className="text-sm"><Link to="/login" state={{ from: `/product/${productId}` }} className="font-semibold text-brand-600 hover:underline">Sign in</Link> to rate this product and leave a comment.</p>
            ) : hasMine ? (
              <p className="text-sm text-mute">You have already reviewed this product. Use Edit on your review to change it.</p>
            ) : (
              <div className="space-y-3">
                <p className="font-display font-bold">Rate this product</p>
                <StarInput value={rating} onChange={setRating} />
                <textarea id="review-comment" className="field min-h-24" maxLength={1000} placeholder="Share what you liked or did not like (optional)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Your comment" />
                {err && <Alert>{err}</Alert>}
                <button className="btn-primary w-full" disabled={busy} onClick={submit}>{busy ? <Spinner /> : 'Post review'}</button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {data.loading && !data.data ? <PageLoader label="Loading reviews" /> : data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : !data.data?.data.length ? (
            <EmptyState icon={<LuStar />} title={filter ? 'No reviews with this rating' : 'No comments yet'} text={filter ? 'Pick another rating or clear the filter.' : 'Reviews from customers appear here.'} action={filter ? <button className="btn-ghost" onClick={() => setFilter(0)}>Show all</button> : undefined} />
          ) : (
            <>
              {data.data.data.map((r) => <ReviewItem key={r._id} review={r} onChanged={changed} />)}
              <Pager page={data.data.meta.page} pages={data.data.meta.totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
