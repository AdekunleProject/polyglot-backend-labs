import { useEffect, useState, type FormEvent } from 'react';
import { LuSearch, LuShieldCheck, LuUserPlus, LuUsers } from 'react-icons/lu';
import * as adm from '../../api/admin';
import { errorMessage } from '../../api/client';
import { Alert, EmptyState, ErrorState, Field, Modal, PageLoader, Pager, StatusBadge, useAsync } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dateShort, ROLE_LABEL } from '../../lib/format';
import type { Profile, Role } from '../../types';
import { PageHead } from './AdminLayout';

const LIMIT = 12;
type Pending = { user: Profile; kind: 'deactivate' | 'delete' | 'role' };

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [deleted, setDeleted] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const list = useAsync(() => adm.listUsers({ search: q || undefined, page, limit: LIMIT, deleted }), [q, page, deleted]);
  const canAdmin = me?.role === 'admin' || me?.role === 'superadmin';

  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); list.reload(); } catch (e) { toast.error(errorMessage(e)); } };

  return (
    <div>
      <PageHead title="People" sub="Customers and the staff you look after. Actions that remove access need a written reason and are recorded."
        action={canAdmin ? <button className="btn-primary" onClick={() => setCreating(true)}><LuUserPlus /> Add staff</button> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72"><LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" /><input className="field pl-10" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" /></div>
        <div className="flex gap-1.5">
          {[['Active', false], ['Deleted', true]].map(([l, v]) => <button key={l as string} onClick={() => { setDeleted(v as boolean); setPage(1); }} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${deleted === v ? 'bg-night-900 text-white' : 'bg-white ring-1 ring-line'}`}>{l as string}</button>)}
        </div>
      </div>
      {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.items.length ? <EmptyState icon={<LuUsers />} title="Nobody here" text="No accounts match this view." /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[780px]">
          <thead className="border-b border-line bg-paper"><tr><th className="table-th">Person</th><th className="table-th">Role</th><th className="table-th">Status</th><th className="table-th">Joined</th><th className="table-th text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {list.data.items.map((u) => {
              const id = u.id;
              const mine = id === me?.id;
              return (
                <tr key={id} className="hover:bg-paper/60">
                  <td className="table-td"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{u.firstname[0]}{u.lastname[0]}</span><div className="min-w-0"><p className="truncate font-semibold">{u.firstname} {u.lastname}</p><p className="truncate text-xs text-mute">{u.email}</p></div></div></td>
                  <td className="table-td"><StatusBadge tone={u.role === 'customer' ? 'gray' : 'violet'}>{ROLE_LABEL[u.role]}</StatusBadge></td>
                  <td className="table-td"><div className="flex flex-wrap gap-1.5">
                    {u.deletedAt ? <StatusBadge tone="red">Deleted</StatusBadge> : u.deactivatedAt ? <StatusBadge tone="amber">Deactivated</StatusBadge> : <StatusBadge tone="green">Active</StatusBadge>}
                    {u.role !== 'customer' && (u.twoFactorEnabled ? <StatusBadge tone="green"><LuShieldCheck /> 2FA</StatusBadge> : <StatusBadge tone="amber">No 2FA</StatusBadge>)}
                  </div></td>
                  <td className="table-td text-mute">{dateShort(u.createdAt)}</td>
                  <td className="table-td"><div className="flex flex-wrap justify-end gap-1.5">
                    {mine ? <span className="text-xs text-mute">You</span> : u.deletedAt ? (
                      <button className="btn-ghost btn-sm" onClick={() => run(() => adm.restoreUser(id), 'Account restored')}>Restore</button>
                    ) : <>
                      {canAdmin && <button className="btn-ghost btn-sm" onClick={() => setPending({ user: u, kind: 'role' })}>Role</button>}
                      {u.deactivatedAt ? <button className="btn-ghost btn-sm" onClick={() => run(() => adm.activateUser(id), 'Account reactivated')}>Reactivate</button>
                        : <button className="btn-ghost btn-sm" onClick={() => setPending({ user: u, kind: 'deactivate' })}>Deactivate</button>}
                      <button className="btn-ghost btn-sm text-rose-600" onClick={() => setPending({ user: u, kind: 'delete' })}>Delete</button>
                    </>}
                  </div></td>
                </tr>
              );
            })}
          </tbody></table></div></div>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil((list.data?.total ?? 0) / LIMIT))} onChange={setPage} />

      {pending && <ActionModal pending={pending} myRole={me!.role} onClose={() => setPending(null)} onDone={(msg) => { setPending(null); toast.success(msg); list.reload(); }} />}
      {creating && <CreateStaff myRole={me!.role} onClose={() => setCreating(false)} onDone={(msg) => { setCreating(false); toast.success(msg); list.reload(); }} />}
    </div>
  );
}

function ActionModal({ pending, myRole, onClose, onDone }: { pending: Pending; myRole: Role; onClose: () => void; onDone: (msg: string) => void }) {
  const { user, kind } = pending;
  const [reason, setReason] = useState('');
  const [role, setRole] = useState<Role>(user.role);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const roles: Role[] = myRole === 'superadmin' ? ['customer', 'manager', 'admin'] : ['customer', 'manager'];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (kind !== 'role' && (reason.trim().length < 5 || reason.trim().length > 500)) { setErr('A reason of 5 to 500 characters is required. It is saved in the audit log.'); return; }
    setBusy(true);
    try {
      if (kind === 'deactivate') { await adm.deactivateUser(user.id, reason.trim()); onDone(`${user.firstname} was deactivated`); }
      else if (kind === 'delete') { await adm.deleteUser(user.id, reason.trim()); onDone(`${user.firstname}'s account was deleted`); }
      else { await adm.changeRole(user.id, role); onDone(`${user.firstname} is now ${ROLE_LABEL[role]}`); }
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };
  const title = kind === 'role' ? `Change role for ${user.firstname}` : kind === 'deactivate' ? `Deactivate ${user.firstname}?` : `Delete ${user.firstname}'s account?`;
  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        {err && <Alert>{err}</Alert>}
        {kind === 'role' ? (
          <Field label="New role"><select className="field" value={role} onChange={(e) => setRole(e.target.value as Role)}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        ) : (
          <>
            <p className="text-sm text-mute">{kind === 'deactivate' ? 'They will be signed out and unable to sign in until reactivated.' : 'The account is hidden and cannot sign in. It can be restored later.'}</p>
            <Field label="Reason" hint="Saved in the audit log."><textarea className="field min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </>
        )}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className={kind === 'delete' ? 'btn-danger' : 'btn-primary'} disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</button></div>
      </form>
    </Modal>
  );
}

function CreateStaff({ myRole, onClose, onDone }: { myRole: Role; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState({ firstname: '', lastname: '', email: '', role: 'manager' as Role });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const roles: Role[] = myRole === 'superadmin' ? ['manager', 'admin'] : ['manager'];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (!/^[A-Za-z]+$/.test(f.firstname) || !/^[A-Za-z]+$/.test(f.lastname)) { setErr('Names may contain letters only.'); return; }
    setBusy(true);
    try { const r = await adm.createStaff(f) as { message?: string }; onDone(r?.message ?? 'Account created. A temporary password was emailed.'); }
    catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Add a staff account">
      <form onSubmit={submit} className="space-y-4">
        {err && <Alert>{err}</Alert>}
        <p className="text-sm text-mute">They receive a temporary password by email and must change it before doing anything else.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name"><input className="field" value={f.firstname} onChange={(e) => setF({ ...f, firstname: e.target.value })} /></Field>
          <Field label="Last name"><input className="field" value={f.lastname} onChange={(e) => setF({ ...f, lastname: e.target.value })} /></Field>
        </div>
        <Field label="Email"><input className="field" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div>
      </form>
    </Modal>
  );
}
