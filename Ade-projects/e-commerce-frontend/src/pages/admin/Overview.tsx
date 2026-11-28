import { Link } from 'react-router-dom';
import { LuBadgeDollarSign, LuBoxes, LuClock, LuPackage, LuRotateCcw, LuShieldAlert, LuTriangleAlert, LuUsers, LuWallet } from 'react-icons/lu';
import { dashboard } from '../../api/admin';
import { ErrorState, PageLoader, Stat, StatusBadge, useAsync } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { dateTime, money, ORDER_PAY_TONE, ORDER_TONE, personName, ROLE_LABEL, timeAgo, titleCase } from '../../lib/format';
import { PageHead } from './AdminLayout';
import type { OrderPaymentStatus, OrderStatus } from '../../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Overview() {
  const { user } = useAuth();
  const kind = user!.role as 'manager' | 'admin' | 'superadmin';
  const d = useAsync(() => dashboard(kind), [kind]);
  if (d.loading) return <PageLoader />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={d.reload} />;
  const data = d.data;
  return (
    <div className="space-y-7">
      <PageHead title={`Good day, ${user!.firstname}`} sub={`${ROLE_LABEL[kind]} overview. Figures update each time you open this page.`} />
      {kind === 'manager' && <Manager data={data} />}
      {kind === 'admin' && <Admin data={data} />}
      {kind === 'superadmin' && <Super data={data} />}
    </div>
  );
}

function Manager({ data }: { data: any }) {
  const o = data.orders as Record<string, number>;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pending orders" value={o.pending ?? 0} icon={<LuClock />} tone="amber" />
        <Stat label="Processing" value={o.processing ?? 0} icon={<LuPackage />} tone="sky" />
        <Stat label="Shipped" value={o.shipped ?? 0} icon={<LuPackage />} />
        <Stat label="Delivered" value={o.delivered ?? 0} icon={<LuPackage />} tone="emerald" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Link to="/admin/orders" className="card-pad block transition hover:border-brand-300">
          <LuTriangleAlert className="text-2xl text-amber-500" />
          <p className="mt-3 font-display text-3xl font-bold">{data.lateOrders.count}</p>
          <p className="text-sm text-mute">Paid orders waiting more than {data.lateOrders.afterHours} hours</p>
        </Link>
        <Link to="/admin/products" className="card-pad block transition hover:border-brand-300">
          <LuBoxes className="text-2xl text-rose-500" />
          <p className="mt-3 font-display text-3xl font-bold">{data.stock.low + data.stock.out}</p>
          <p className="text-sm text-mute">{data.stock.out} out of stock, {data.stock.low} running low</p>
        </Link>
        <Link to="/admin/refunds" className="card-pad block transition hover:border-brand-300">
          <LuRotateCcw className="text-2xl text-brand-600" />
          <p className="mt-3 font-display text-3xl font-bold">{data.refundWork.complaintsToVerify + data.refundWork.replacementsToSend}</p>
          <p className="text-sm text-mute">{data.refundWork.complaintsToVerify} complaints to verify, {data.refundWork.replacementsToSend} replacements to send</p>
        </Link>
      </div>
      <div className="card-pad">
        <h2 className="font-display text-lg font-bold">Your last 30 days</h2>
        <p className="mt-1 text-sm text-mute">{data.myActivity.total} actions{data.myActivity.lastActionAt ? `, last ${timeAgo(data.myActivity.lastActionAt)}` : ''}.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(data.myActivity.byAction as Record<string, number>).map(([k, v]) => <span key={k} className="badge-violet">{titleCase(k)} · {v}</span>)}
        </div>
      </div>
    </>
  );
}

function RecentOrders({ rows }: { rows: any[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4"><h2 className="font-display text-lg font-bold">Recent orders</h2><Link to="/admin/orders" className="text-sm font-semibold text-brand-600">All orders</Link></div>
      <div className="overflow-x-auto"><table className="w-full">
        <thead className="border-y border-line bg-paper"><tr><th className="table-th">Customer</th><th className="table-th">Total</th><th className="table-th">Status</th><th className="table-th">Payment</th><th className="table-th">When</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r._id}><td className="table-td font-medium">{personName(r.user) || '—'}</td><td className="table-td">{money(r.total)}</td>
              <td className="table-td"><StatusBadge tone={ORDER_TONE[r.status as OrderStatus]}>{titleCase(r.status)}</StatusBadge></td>
              <td className="table-td"><StatusBadge tone={ORDER_PAY_TONE[r.paymentStatus as OrderPaymentStatus]}>{titleCase(r.paymentStatus)}</StatusBadge></td>
              <td className="table-td text-mute">{timeAgo(r.createdAt)}</td></tr>
          ))}
        </tbody></table></div>
    </div>
  );
}

function Admin({ data }: { data: any }) {
  const s = data.summary;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue, all time" value={money(s.revenue)} icon={<LuWallet />} tone="emerald" />
        <Stat label="Last 30 days" value={money(data.money.revenueLast30Days)} icon={<LuBadgeDollarSign />} sub={`${money(data.money.refundedLast30Days)} refunded`} />
        <Stat label="Orders" value={s.totalOrders} icon={<LuPackage />} sub={`${s.pendingOrders} pending`} tone="sky" />
        <Stat label="Customers" value={s.totalCustomers} icon={<LuUsers />} sub={`${s.totalProducts} active products`} tone="amber" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/admin/payments" className="card-pad flex items-center gap-4 transition hover:border-brand-300"><LuBadgeDollarSign className="text-3xl text-brand-600" /><div><p className="font-display text-2xl font-bold">{data.money.bankTransfersAwaitingReview}</p><p className="text-sm text-mute">Bank transfers awaiting your review</p></div></Link>
        <Link to="/admin/refunds" className="card-pad flex items-center gap-4 transition hover:border-brand-300"><LuRotateCcw className="text-3xl text-rose-500" /><div><p className="font-display text-2xl font-bold">{data.refundsAwaitingDecision}</p><p className="text-sm text-mute">Refunds awaiting your decision</p></div></Link>
      </div>
      <RecentOrders rows={data.recentOrders} />
    </>
  );
}

function Super({ data }: { data: any }) {
  const m = data.money;
  const byRole = data.team.byRole as Record<string, number>;
  const without = data.team.staffWithout2fa as any[];
  const recent = data.activity.recent as any[];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue, all time" value={money(m.revenueAllTime)} icon={<LuWallet />} tone="emerald" />
        <Stat label="Last 30 days" value={money(m.revenueLast30Days)} icon={<LuBadgeDollarSign />} sub={`${money(m.refundedLast30Days)} refunded (${m.refundCountLast30Days})`} />
        <Stat label="Orders" value={data.orders.total} icon={<LuPackage />} tone="sky" />
        <Stat label="Customers" value={data.customers.total} icon={<LuUsers />} tone="amber" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="font-display text-lg font-bold">Team</h2>
          <div className="mt-3 flex flex-wrap gap-2">{Object.entries(byRole).map(([r, n]) => <span key={r} className="badge-violet">{n} {titleCase(r)}</span>)}<span className="badge-gray">{data.team.deactivated} deactivated</span></div>
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <LuShieldAlert className="mt-0.5 shrink-0 text-lg" />
            <div>{without.length === 0 ? 'Every active staff member has two-factor turned on.' : <>Without two-factor: {without.map((u) => personName(u)).join(', ')}. <Link to="/admin/users" className="font-semibold underline">Review people</Link></>}</div>
          </div>
        </div>
        <div className="card-pad">
          <h2 className="font-display text-lg font-bold">Refund queue</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[['To verify', data.refundQueue.complaintsToVerify], ['To decide', data.refundQueue.awaitingDecision], ['To send', data.refundQueue.replacementsToSend]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-paper p-3"><dd className="font-display text-2xl font-bold">{v as number}</dd><dt className="text-xs text-mute">{l as string}</dt></div>
            ))}
          </dl>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4"><h2 className="font-display text-lg font-bold">Latest staff activity</h2><Link to="/admin/audit" className="text-sm font-semibold text-brand-600">Audit log</Link></div>
        <ul className="divide-y divide-line">
          {recent.map((a) => <li key={a._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="font-medium">{titleCase(a.action)}</span><span className="text-mute">{dateTime(a.createdAt)}</span></li>)}
        </ul>
      </div>
    </>
  );
}
