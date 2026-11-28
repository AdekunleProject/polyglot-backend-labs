import { useState } from 'react';
import { LuBadgeDollarSign, LuDownload, LuFlag, LuMail, LuPackage, LuRotateCcw, LuUsers } from 'react-icons/lu';
import * as adm from '../../api/admin';
import { errorMessage } from '../../api/client';
import { BarChart } from '../../components/charts';
import { ErrorState, PageLoader, Stat, StatusBadge, useAsync } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { compact, dateTime, money, ROLE_LABEL } from '../../lib/format';
import { PageHead } from './AdminLayout';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

export default function Reports() {
  const { user } = useAuth();
  const toast = useToast();
  const money_ = user!.role === 'admin' || user!.role === 'superadmin';
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const staff = useAsync(() => adm.staffActivity(from, to), [from, to]);
  const sales = useAsync(() => (money_ ? adm.salesReport(from, to) : Promise.resolve(null)), [from, to, money_]);
  const [busy, setBusy] = useState(false);

  const csv = async (path: '/analytics/staff-activity' | '/analytics/sales', name: string) => {
    try { download(name, await adm.downloadCsv(path, from, to)); } catch (e) { toast.error(errorMessage(e)); }
  };
  const digest = async () => {
    setBusy(true);
    try { const r = await adm.sendDigest(); toast.success(r.message ?? 'Digest sent'); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-7">
      <PageHead title="Reports" sub="Sales and staff activity for the period you choose."
        action={user!.role === 'superadmin' ? <button className="btn-ghost" onClick={digest} disabled={busy}><LuMail /> {busy ? 'Sending…' : 'Send weekly digest now'}</button> : undefined} />
      <div className="card-pad flex flex-wrap items-end gap-4">
        <label><span className="label">From</span><input type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label><span className="label">To</span><input type="date" className="field" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {money_ && (
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Sales</h2><button className="btn-ghost btn-sm" onClick={() => csv('/analytics/sales', `sales_${from}_${to}.csv`)}><LuDownload /> CSV</button></div>
          {sales.loading && !sales.data ? <PageLoader /> : sales.error || !sales.data ? <ErrorState error={sales.error} onRetry={sales.reload} /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Revenue" value={money(sales.data.totals.revenue)} icon={<LuBadgeDollarSign />} tone="emerald" sub={`${sales.data.totals.payments} paid orders`} />
                <Stat label="Orders placed" value={sales.data.totals.orders} icon={<LuPackage />} tone="sky" />
                <Stat label="Refunded" value={money(sales.data.totals.refundedAmount)} icon={<LuRotateCcw />} tone="rose" sub={`${sales.data.totals.refunds} refunds`} />
                <Stat label="New customers" value={sales.data.totals.newCustomers} icon={<LuUsers />} tone="amber" />
              </div>
              <div className="card-pad mt-4">
                <p className="mb-2 text-sm font-semibold text-mute">Revenue per day</p>
                <BarChart money data={sales.data.byDay.map((d) => ({ label: d.day.slice(5), value: d.revenue }))} />
                <p className="mt-1 text-xs text-mute">Peak day {money(Math.max(0, ...sales.data.byDay.map((d) => d.revenue)))} · total {compact(sales.data.byDay.reduce((s, d) => s + d.orders, 0))} orders</p>
              </div>
            </>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Staff activity</h2><button className="btn-ghost btn-sm" onClick={() => csv('/analytics/staff-activity', `staff-activity_${from}_${to}.csv`)}><LuDownload /> CSV</button></div>
        {staff.loading && !staff.data ? <PageLoader /> : staff.error || !staff.data ? <ErrorState error={staff.error} onRetry={staff.reload} /> : (
          <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[820px]">
            <thead className="border-b border-line bg-paper"><tr><th className="table-th">Person</th><th className="table-th">Role</th><th className="table-th">Actions</th><th className="table-th">Deletions</th><th className="table-th">Lookups</th><th className="table-th">Last action</th><th className="table-th">Flags</th></tr></thead>
            <tbody className="divide-y divide-line">
              {staff.data.staff.map((s) => (
                <tr key={s.id}>
                  <td className="table-td"><p className="font-semibold">{s.name}</p><p className="text-xs text-mute">{s.email}</p></td>
                  <td className="table-td">{ROLE_LABEL[s.role]}</td><td className="table-td font-semibold">{s.totalActions}</td><td className="table-td">{s.deletes}</td><td className="table-td">{s.lookups}</td>
                  <td className="table-td text-mute">{s.lastActionAt ? dateTime(s.lastActionAt) : '—'}</td>
                  <td className="table-td">{s.flags.length ? <div className="flex flex-wrap gap-1.5">{s.flags.map((f) => <StatusBadge key={f} tone="amber"><LuFlag /> {f}</StatusBadge>)}</div> : <span className="text-xs text-mute">None</span>}</td>
                </tr>
              ))}
            </tbody></table></div></div>
        )}
      </section>
    </div>
  );
}
