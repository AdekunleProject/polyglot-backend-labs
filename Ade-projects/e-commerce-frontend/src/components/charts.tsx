import { compact } from '../lib/format';

interface Point { label: string; value: number }

/** A small dependency-free bar chart with gridlines, used on reports and dashboards. */
export function BarChart({ data, height = 180, money = false }: { data: Point[]; height?: number; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 640;
  const pad = { l: 44, r: 8, t: 10, b: 22 };
  const inner = { w: w - pad.l - pad.r, h: height - pad.t - pad.b };
  const bw = Math.max(3, Math.min(26, inner.w / Math.max(1, data.length) - 4));
  const ticks = [0, 0.5, 1];
  const every = Math.ceil(data.length / 8);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#C026D3" />
        </linearGradient>
      </defs>
      {ticks.map((t) => {
        const y = pad.t + inner.h * (1 - t);
        return (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#E7E5F4" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#6B6A85">{money ? `₦${compact(max * t)}` : compact(max * t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pad.l + (inner.w / data.length) * (i + 0.5) - bw / 2;
        const h = (d.value / max) * inner.h;
        return (
          <g key={`${d.label}${i}`}>
            <rect x={x} y={pad.t + inner.h - h} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} rx="3" fill="url(#bar)">
              <title>{`${d.label}: ${money ? `₦${d.value.toLocaleString()}` : d.value}`}</title>
            </rect>
            {i % every === 0 && <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="#6B6A85">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}
