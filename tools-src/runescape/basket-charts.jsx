import React, { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear, niceTicks } from "./day-charts.jsx";

/* ================= basket charts =================
   The Commodities tab's one real chart: every basket's level across the
   window, rebased to 100, on one axis — so wood and metal and runes sit on
   the same scale however many gp apart their goods are. Drawn in real
   pixels (a ResizeObserver reads the panel's width) so the type stays the
   type at 1120px and at 390px alike. A crosshair snaps to the nearest day
   and reads every visible series at once; the arrow keys walk it too. */

const DAY = 86400;
const PAD = { l: 44, r: 10, t: 14, b: 26 };
const LABEL_W = 120;  // room kept at the right for the end labels
const LABEL_GAP = 13; // minimum vertical spacing between end labels

function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (t) => { const d = new Date(t * 1000); return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`; };
const fullLabel = (t) => { const d = new Date(t * 1000); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const lvl = (v) => (v == null ? "–" : v.toFixed(1));

// which days get an x tick: weekly for a month, fortnightly for a quarter,
// the first of each month for a year — then thinned, newest kept, until
// every label has room on a narrow panel
function xTicks(days, plotWidth) {
  const n = days.length;
  if (n <= 1) return [];
  let out = [];
  if (n <= 40) { for (let i = n - 1; i >= 0; i -= 7) out.unshift({ i, label: dayLabel(days[i]) }); }
  else if (n <= 120) { for (let i = n - 1; i >= 0; i -= 14) out.unshift({ i, label: dayLabel(days[i]) }); }
  else for (let i = 0; i < n; i++) { const d = new Date(days[i] * 1000); if (d.getUTCDate() === 1) out.push({ i, label: MONTH[d.getUTCMonth()] }); }
  const room = Math.max(1, Math.floor(plotWidth / 54));
  if (out.length > room) {
    const step = Math.ceil(out.length / room);
    out = out.filter((_, k) => (out.length - 1 - k) % step === 0);
  }
  return out;
}

export function LevelChart({ days, series, events = [], hidden, onToggle, height = 280, ariaLabel = "Basket levels", note }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [cursor, setCursor] = useState(null);
  const n = days.length;
  const visible = useMemo(() => series.filter((s) => !hidden || !hidden.has(s.key)), [series, hidden]);

  const geo = useMemo(() => {
    if (n < 2) return null;
    let lo = Infinity, hi = -Infinity;
    for (const s of visible) for (const v of s.levels) if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) return null;
    // the axis starts where the drawn series start: while the year's history
    // is still landing, the week already known fills the panel instead of
    // huddling at its right edge
    let start = n - 1;
    for (const s of visible) { const f = s.levels.findIndex((v) => v != null); if (f >= 0 && f < start) start = f; }
    if (start >= n - 1) return null;
    const span = n - 1 - start;
    lo = Math.min(lo, 100); hi = Math.max(hi, 100);
    const pad = Math.max((hi - lo) * 0.06, 0.5);
    lo -= pad; hi += pad;
    const x0 = PAD.l, x1 = width - PAD.r - LABEL_W;
    const y0 = height - PAD.b, y1 = PAD.t;
    const sx = (i) => x0 + ((i - start) / span) * (x1 - x0);
    const sy = scaleLinear(lo, hi, y0, y1);
    const yTicks = niceTicks(lo, hi, 5).filter((v) => v >= lo && v <= hi);
    const paths = visible.map((s) => {
      let d = "", prev = -2;
      s.levels.forEach((v, i) => {
        if (v == null || !isFinite(v)) return;
        d += `${prev === i - 1 ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`;
        prev = i;
      });
      let li = -1;
      for (let i = s.levels.length - 1; i >= 0; i--) if (s.levels[i] != null) { li = i; break; }
      return { s, d, li, endY: li >= 0 ? sy(s.levels[li]) : null, endX: li >= 0 ? sx(li) : null };
    });
    // end labels: sorted by where the line ends, pushed apart so none overlap
    const labels = paths.filter((p) => p.li >= 0).map((p) => ({ ...p, y: p.endY })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < LABEL_GAP) labels[i].y = labels[i - 1].y + LABEL_GAP;
    for (let i = labels.length - 1; i >= 0; i--) {
      const limit = i === labels.length - 1 ? y0 - 2 : labels[i + 1].y - LABEL_GAP;
      if (labels[i].y > limit) labels[i].y = limit;
    }
    const ev = events.map((t) => (t - days[0]) / DAY).filter((f) => f >= start && f <= n - 1).map((f) => sx(f));
    const xt = xTicks(days.slice(start), x1 - x0).map((t) => ({ i: t.i + start, label: t.label }));
    return { x0, x1, y0, y1, sx, sy, yTicks, paths, labels, ev, xt, start, span };
  }, [visible, days, n, width, height, events]);

  const idxAt = (clientX) => {
    if (!geo) return null;
    const rect = wrapRef.current?.getBoundingClientRect();
    const x = clientX - (rect?.left || 0);
    const f = ((x - geo.x0) / (geo.x1 - geo.x0)) * geo.span;
    return Math.max(geo.start, Math.min(n - 1, geo.start + Math.round(f)));
  };
  const onKey = (e) => {
    if (!geo) return;
    const cur = cursor == null ? n - 1 : cursor;
    if (e.key === "ArrowLeft") { setCursor(Math.max(geo.start, cur - (e.shiftKey ? 7 : 1))); e.preventDefault(); }
    else if (e.key === "ArrowRight") { setCursor(Math.min(n - 1, cur + (e.shiftKey ? 7 : 1))); e.preventDefault(); }
    else if (e.key === "Home") { setCursor(geo.start); e.preventDefault(); }
    else if (e.key === "End") { setCursor(n - 1); e.preventDefault(); }
    else if (e.key === "Escape") setCursor(null);
  };

  const tip = useMemo(() => {
    if (!geo || cursor == null) return null;
    const rows = visible.map((s) => ({ s, v: s.levels[cursor] })).filter((r) => r.v != null).sort((a, b) => b.v - a.v);
    const w = 168, lineH = 15, h = 22 + rows.length * lineH;
    const cx = geo.sx(cursor);
    const flip = cx > (geo.x0 + geo.x1) / 2;
    const bx = flip ? cx - 10 - w : cx + 10;
    const by = Math.max(PAD.t, Math.min(geo.y0 - h, PAD.t + 4));
    return { rows, w, h, cx, bx, by, lineH, date: fullLabel(days[cursor]) };
  }, [geo, cursor, visible, days]);

  return (
    <div className="bc-wrap" ref={wrapRef}>
      {!geo ? (
        <div className="dc-empty" style={{ height }}>Not enough history to draw yet</div>
      ) : (
        <svg className="bc-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}
          tabIndex={0} onKeyDown={onKey} onBlur={() => setCursor(null)}
          onPointerMove={(e) => setCursor(idxAt(e.clientX))} onPointerLeave={() => setCursor(null)}>
          {/* grid */}
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line className={"bc-grid" + (v === 100 ? " base" : "")} x1={geo.x0} x2={geo.x1} y1={geo.sy(v)} y2={geo.sy(v)} />
              <text className="bc-axis-y" x={geo.x0 - 6} y={geo.sy(v)}>{v}</text>
            </g>
          ))}
          {geo.xt.map((t) => (
            <g key={t.i}>
              <line className="bc-tick" x1={geo.sx(t.i)} x2={geo.sx(t.i)} y1={geo.y0} y2={geo.y0 + 4} />
              <text className="bc-axis-x" x={geo.sx(t.i)} y={geo.y0 + 16} textAnchor="middle">{t.label}</text>
            </g>
          ))}
          {note && <text className="bc-note" x={geo.x1} y={geo.y1 + 2}>{note}</text>}
          {/* the weekly updates */}
          {geo.ev.map((x, i) => <line key={i} className="bc-event" x1={x} x2={x} y1={geo.y1} y2={geo.y0} />)}
          {/* the lines */}
          {geo.paths.map((p) => (
            <path key={p.s.key} className={"bc-line" + (p.s.dashed ? " dashed" : "")} d={p.d} style={{ stroke: p.s.color }} />
          ))}
          {/* end labels: a short colour key, then the name in text ink */}
          {geo.labels.map((l) => (
            <g key={l.s.key}>
              <line className="bc-key" x1={l.endX + 4} x2={l.endX + 14} y1={l.y} y2={l.y} style={{ stroke: l.s.color }} />
              <text className="bc-endlabel" x={l.endX + 18} y={l.y}>{l.s.name} <tspan className="v">{lvl(l.s.levels[l.li])}</tspan></text>
            </g>
          ))}
          {/* the crosshair */}
          {tip && <>
            <line className="bc-cursor" x1={tip.cx} x2={tip.cx} y1={geo.y1} y2={geo.y0} />
            {tip.rows.map((r) => <circle key={r.s.key} className="bc-dot" cx={tip.cx} cy={geo.sy(r.v)} r={3.5} style={{ fill: r.s.color }} />)}
            <g className="bc-tip">
              <rect x={tip.bx} y={tip.by} width={tip.w} height={tip.h} rx={2} />
              <text className="bc-tip-date" x={tip.bx + 8} y={tip.by + 14}>{tip.date}</text>
              {tip.rows.map((r, i) => (
                <g key={r.s.key}>
                  <line className="bc-key" x1={tip.bx + 8} x2={tip.bx + 18} y1={tip.by + 24 + i * tip.lineH} y2={tip.by + 24 + i * tip.lineH} style={{ stroke: r.s.color }} />
                  <text className="bc-tip-row" x={tip.bx + 22} y={tip.by + 28 + i * tip.lineH}>{r.s.name}</text>
                  <text className="bc-tip-val" x={tip.bx + tip.w - 8} y={tip.by + 28 + i * tip.lineH} textAnchor="end">{lvl(r.v)}</text>
                </g>
              ))}
            </g>
          </>}
          {/* a wide, invisible hit layer so the pointer never has to find a line */}
          <rect x={geo.x0} y={geo.y1} width={geo.x1 - geo.x0} height={geo.y0 - geo.y1} fill="transparent" />
        </svg>
      )}
      <div className="bc-legend" role="group" aria-label="Series">
        {series.map((s) => {
          const on = !hidden || !hidden.has(s.key);
          return (
            <button key={s.key} type="button" className={"bc-lg" + (on ? " on" : "")} aria-pressed={on} onClick={() => onToggle && onToggle(s.key)}>
              <span className={"bc-lgkey" + (s.dashed ? " dashed" : "")} style={{ borderColor: s.color }} />{s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const BASKET_CSS = `
.bc-wrap { position:relative; width:100%; }
.bc-chart { display:block; background:var(--inset2); border:1px solid var(--edge); border-radius:2px; overflow:visible; touch-action:pan-y; }
.bc-chart:focus-visible { outline:2px solid var(--yellow); outline-offset:1px; }
.bc-grid { stroke:var(--stone-lo); stroke-width:1; shape-rendering:crispEdges; }
.bc-grid.base { stroke:var(--dark-tan); opacity:.7; }
.bc-tick { stroke:var(--stone-lo); stroke-width:1; shape-rendering:crispEdges; }
.bc-event { stroke:var(--tan); stroke-width:1; opacity:.16; shape-rendering:crispEdges; }
.bc-axis-y { font-family:var(--mono); font-size:10px; fill:var(--tan); text-anchor:end; dominant-baseline:middle; }
.bc-axis-x { font-family:var(--mono); font-size:10px; fill:var(--tan); }
.bc-note { font-family:var(--mono); font-size:10px; fill:var(--warn); text-anchor:end; dominant-baseline:hanging; }
.bc-line { fill:none; stroke-width:2; stroke-linejoin:round; stroke-linecap:round; }
.bc-line.dashed { stroke-width:1.5; stroke-dasharray:5 4; opacity:.85; }
.bc-key { stroke-width:2.5; stroke-linecap:round; }
.bc-endlabel { font-family:var(--mono); font-size:10.5px; fill:var(--tan); dominant-baseline:middle; }
.bc-endlabel .v { fill:var(--white); font-weight:600; }
.bc-cursor { stroke:var(--yellow); stroke-width:1; opacity:.6; shape-rendering:crispEdges; pointer-events:none; }
.bc-dot { stroke:var(--inset2); stroke-width:2; pointer-events:none; }
.bc-tip { pointer-events:none; }
.bc-tip rect { fill:var(--stone); stroke:var(--edge); stroke-width:1; opacity:.96; }
.bc-tip-date { font-family:var(--mono); font-size:10.5px; fill:var(--orange); font-weight:600; }
.bc-tip-row { font-family:'Segoe UI',system-ui,sans-serif; font-size:11px; fill:var(--tan); }
.bc-tip-val { font-family:var(--mono); font-size:11.5px; fill:var(--white); font-weight:600; }
.bc-legend { display:flex; gap:4px 10px; flex-wrap:wrap; margin-top:8px; }
.bc-lg { display:inline-flex; align-items:center; gap:6px; font:inherit; font-size:12px; color:var(--tan); background:none; border:none; padding:2px 4px; cursor:pointer; text-shadow:1px 1px 0 #000; }
.bc-lg.on { color:var(--white); }
.bc-lg:hover { color:var(--yellow); }
.bc-lgkey { display:inline-block; width:14px; height:0; border-top:2.5px solid; border-radius:2px; opacity:.35; }
.bc-lg.on .bc-lgkey { opacity:1; }
.bc-lgkey.dashed { border-top-style:dashed; }
`;
