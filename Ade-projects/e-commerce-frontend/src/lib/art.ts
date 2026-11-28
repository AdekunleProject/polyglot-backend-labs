/** Generated product artwork, used for the demo catalogue and as the fallback when a product has no photo. */
const PALETTES: [string, string, string][] = [
  ['#7C3AED', '#C026D3', '#FBBF24'],
  ['#0EA5E9', '#6366F1', '#F0ABFC'],
  ['#F43F5E', '#F97316', '#FDE68A'],
  ['#10B981', '#0EA5E9', '#FDE047'],
  ['#8B5CF6', '#EC4899', '#67E8F9'],
  ['#F59E0B', '#EF4444', '#FDF2F8'],
  ['#14B8A6', '#6366F1', '#FCD34D'],
  ['#334155', '#7C3AED', '#F9A8D4'],
];

const ICONS: Record<string, string> = {
  phone: '<rect x="-46" y="-80" width="92" height="160" rx="18" fill="#fff" fill-opacity=".92"/><rect x="-38" y="-68" width="76" height="120" rx="8" fill="#fff" fill-opacity=".25"/><circle cx="0" cy="66" r="6" fill="#fff" fill-opacity=".35"/>',
  laptop: '<rect x="-84" y="-58" width="168" height="108" rx="10" fill="#fff" fill-opacity=".92"/><rect x="-74" y="-48" width="148" height="88" rx="4" fill="#fff" fill-opacity=".25"/><path d="M-110 56h220l-12 16h-196z" fill="#fff" fill-opacity=".8"/>',
  shirt: '<path d="M-40-76-96-44l20 40 24-12V76h104V-16l24 12 20-40-56-32c-4 20-18 30-40 30s-36-10-40-30z" fill="#fff" fill-opacity=".92"/>',
  shoe: '<path d="M-100 30c0-26 10-40 30-44l34-8 22-34 20 10-8 26 40 14c20 6 38 18 38 40v8h-176z" fill="#fff" fill-opacity=".92"/><path d="M-100 44h176" stroke="#fff" stroke-opacity=".4" stroke-width="8"/>',
  home: '<path d="M-86 8 0-72 86 8v68H-86z" fill="#fff" fill-opacity=".92"/><rect x="-18" y="26" width="36" height="54" rx="4" fill="#fff" fill-opacity=".3"/>',
  beauty: '<rect x="-24" y="-30" width="48" height="104" rx="12" fill="#fff" fill-opacity=".92"/><rect x="-14" y="-72" width="28" height="42" rx="6" fill="#fff" fill-opacity=".75"/>',
  watch: '<rect x="-34" y="-96" width="68" height="40" rx="8" fill="#fff" fill-opacity=".6"/><rect x="-34" y="56" width="68" height="40" rx="8" fill="#fff" fill-opacity=".6"/><circle r="56" fill="#fff" fill-opacity=".92"/><path d="M0-30V0l22 14" stroke="#7C3AED" stroke-width="7" stroke-linecap="round" fill="none"/>',
  bag: '<path d="M-60-22h120l14 96h-148z" fill="#fff" fill-opacity=".92"/><path d="M-30-22v-18a30 30 0 0 1 60 0v18" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>',
  audio: '<path d="M-78 18v-22a78 78 0 0 1 156 0v22" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><rect x="-92" y="6" width="38" height="70" rx="16" fill="#fff" fill-opacity=".92"/><rect x="54" y="6" width="38" height="70" rx="16" fill="#fff" fill-opacity=".92"/>',
  cart: '<path d="M-92-60h34l24 104h98l22-74H-48" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="-18" cy="72" r="12" fill="#fff"/><circle cx="62" cy="72" r="12" fill="#fff"/>',
};

export const ART_KINDS = Object.keys(ICONS);

export function productArt(seed: string, kind: string = 'cart'): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b, c] = PALETTES[h % PALETTES.length];
  const icon = ICONS[kind] ?? ICONS.cart;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="r" cx=".25" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" fill="url(#g)"/><rect width="400" height="400" fill="url(#r)"/><circle cx="330" cy="70" r="90" fill="#fff" fill-opacity=".10"/><circle cx="60" cy="350" r="120" fill="#000" fill-opacity=".07"/><g transform="translate(200 200)">${icon}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
