import { useState } from 'react';
import { LuCheck, LuCopy, LuMail, LuShare2 } from 'react-icons/lu';
import { Modal } from './ui';
import { useToast } from '../context/ToastContext';

export interface ShareTarget { title: string; text: string; url: string }

const links = (t: ShareTarget) => {
  const url = encodeURIComponent(t.url);
  const text = encodeURIComponent(`${t.text} ${t.url}`);
  return [
    { name: 'WhatsApp', href: `https://wa.me/?text=${text}`, tone: 'bg-[#25D366]' },
    { name: 'Telegram', href: `https://t.me/share/url?url=${url}&text=${encodeURIComponent(t.text)}`, tone: 'bg-[#229ED9]' },
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${url}`, tone: 'bg-[#1877F2]' },
    { name: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(t.text)}&url=${url}`, tone: 'bg-black' },
  ];
};

/** Opens the phone's own share sheet when there is one, otherwise a list of apps and a copy button. */
export function ShareButton({ target, label = 'Share', className = 'btn-ghost btn-sm' }: { target: ShareTarget; label?: string; className?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const start = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: target.title, text: target.text, url: target.url }); return; } catch (e) { if ((e as DOMException).name === 'AbortError') return; }
    }
    setOpen(true);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(target.url); setCopied(true); toast.success('Link copied'); window.setTimeout(() => setCopied(false), 2000); } catch { toast.error('Copy failed. Select the link and copy it by hand.'); }
  };

  return (
    <>
      <button type="button" className={className} onClick={start} aria-label={`${label}: ${target.title}`}><LuShare2 /> {label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <p className="text-sm text-mute">{target.text}</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {links(target).map((l) => (
            <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:brightness-110 ${l.tone}`}>{l.name}</a>
          ))}
          <a href={`mailto:?subject=${encodeURIComponent(target.title)}&body=${encodeURIComponent(`${target.text} ${target.url}`)}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-night-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-125"><LuMail /> Email</a>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-brand-50/50 p-2">
          <input readOnly value={target.url} aria-label="Link" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" onFocus={(e) => e.currentTarget.select()} />
          <button className="btn-primary btn-sm" onClick={copy}>{copied ? <LuCheck /> : <LuCopy />} {copied ? 'Copied' : 'Copy'}</button>
        </div>
      </Modal>
    </>
  );
}
