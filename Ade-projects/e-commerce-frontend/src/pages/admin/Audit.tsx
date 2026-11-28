import { useState } from 'react';
import { LuScrollText } from 'react-icons/lu';
import * as adm from '../../api/admin';
import { EmptyState, ErrorState, PageLoader, Pager, useAsync } from '../../components/ui';
import { dateTime, titleCase } from '../../lib/format';
import { PageHead } from './AdminLayout';

const LIMIT = 20;
export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const log = useAsync(() => adm.auditLog({ page, limit: LIMIT, action: action.trim() || undefined }), [page, action]);
  const people = useAsync(async () => {
    const r = await adm.listUsers({ page: 1, limit: 50 });
    return new Map(r.items.map((u) => [u.id, `${u.firstname} ${u.lastname}`]));
  }, []);
  return (
    <div>
      <PageHead title="Audit log" sub="Every staff action that changes something, with who did it and when. Only the superadmin can read this." />
      <div className="mb-4 max-w-xs"><input className="field" placeholder="Filter by action, e.g. product.delete" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter by action" /></div>
      {log.loading && !log.data ? <PageLoader /> : log.error ? <ErrorState error={log.error} onRetry={log.reload} /> : !log.data?.items.length ? <EmptyState icon={<LuScrollText />} title="No entries" text="Nothing matches this filter." /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead className="border-b border-line bg-paper"><tr><th className="table-th">When</th><th className="table-th">Who</th><th className="table-th">Action</th><th className="table-th">Target</th><th className="table-th">Details</th></tr></thead>
          <tbody className="divide-y divide-line">
            {log.data.items.map((a) => (
              <tr key={a._id}>
                <td className="table-td whitespace-nowrap text-mute">{dateTime(a.createdAt)}</td>
                <td className="table-td font-medium">{(a.actorId && people.data?.get(a.actorId)) || (a.actorId ? `#${a.actorId.slice(-6)}` : 'System')}</td>
                <td className="table-td"><span className="badge-violet">{titleCase(a.action)}</span></td>
                <td className="table-td text-mute">{a.target ? `${a.target.type} #${a.target.id.slice(-6)}` : '—'}</td>
                <td className="table-td max-w-xs truncate font-mono text-xs text-mute">{a.details && Object.keys(a.details).length ? JSON.stringify(a.details) : '—'}</td>
              </tr>
            ))}
          </tbody></table></div></div>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil((log.data?.total ?? 0) / LIMIT))} onChange={setPage} />
    </div>
  );
}
