import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LuCircleAlert, LuCircleCheck, LuInfo, LuX } from 'react-icons/lu';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; text: string }
interface ToastApi { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }

const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = (id: number) => setItems((l) => l.filter((t) => t.id !== id));
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq;
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 6500 : 4000);
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t) }), [push]);

  const icon = { success: <LuCircleCheck className="text-emerald-500" />, error: <LuCircleAlert className="text-rose-500" />, info: <LuInfo className="text-brand-500" /> };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-lift">
            <span className="mt-0.5 text-lg">{icon[t.kind]}</span>
            <p className="flex-1 text-sm font-medium text-ink">{t.text}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-mute hover:text-ink"><LuX /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c;
}
