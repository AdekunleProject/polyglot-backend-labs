import { useEffect, useState } from 'react';
import { listUsers, deactivateUser } from '../../api/users';
import type { User } from '../../types';
import { extractErrorMessage } from '../../api/client';

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listUsers()
      .then(setUsers)
      .catch((err) => setError(extractErrorMessage(err, 'Could not load users.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Deactivate this account?')) return;
    setBusyId(userId);
    try {
      await deactivateUser(userId);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not deactivate that user.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl uppercase mb-4">All Users ({users.length})</h2>
      {error && <p className="text-warnred font-mono text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="label-eyebrow">Loading&hellip;</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u._id ?? u.id} className="ticket p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-display uppercase">
                  {u.firstname} {u.lastname}
                </p>
                <p className="sku">{u.email}</p>
              </div>
              <span className="stamp border-ink text-ink">{u.role}</span>
              <button
                disabled={busyId === (u._id ?? u.id)}
                onClick={() => handleDeactivate((u._id ?? u.id) as string)}
                className="label-eyebrow text-warnred hover:underline"
              >
                Deactivate
              </button>
            </div>
          ))}
          {!loading && users.length === 0 && <p className="label-eyebrow">No users on record.</p>}
        </div>
      )}
    </div>
  );
}
