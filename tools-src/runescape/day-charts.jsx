import React, { useMemo } from "react";

/* ================= day-desk charts =================
   Small inline-SVG chart components for the GE "day desk" — no chart lib,
   just paths built by hand and scaled to a fixed viewBox so text never
   distorts when the SVG is stretched to its container's width.

   Everything here is a pure render from props (no measurement, no effects)
   so these drop straight into a table cell or a popup without layout
   jank. Colour comes from the host's --good/--bad/--tan/--yellow theme
   vars, wired in via CHART_CSS below, so a chart on a stone panel looks
   like it was carved from the same stone. */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---- shared scale helpers ---- */
// linear scale, domain [d0,d1] -> range [r0,r1]; guards a flat/degenerate domain
export function scaleLinear(d0, d1, r0, r1) {
  const span = d1 - d0;
  if (!isFinite(span) || span === 0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

// "nice" round step for axis ticks — same trick every chart lib uses:
// snap to 1/2/5 * 10^n so labels read as round numbers, not scale noise
function niceStep(range, targetTicks) {
  if (!(range > 0)) return 1;
  const raw = range / Math.max(1, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}
export function niceTicks(lo, hi, targetTicks) {
  if (!(hi > lo)) return [lo];
  const step = niceStep(hi - lo, targetTicks);
  const start = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(6));
  return out.length ? out : [lo, hi];
}

// a label with a solid backing chip, matching the chart's own background —
// order lines and peak/trough hour labels sit ON TOP of the price paths, and
// a bare <text> there gets sliced by whatever line crosses under it. No
// canvas measurement available in pure SVG, so the chip width is a rough
// monospace estimate — generous on purpose, a slightly wide chip is invisible
// against the flat chart background, a too-narrow one lets a line bleed through.
function TextChip({ x, y, anchor = "end", text, className, fontSize = 10.5 }) {
  const w = text.length * fontSize * 0.62 + 6;
  const h = fontSize + 5;
  const rectX = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return (
    <g>
      <rect x={rectX} y={y - fontSize - 1} width={w} height={h} className="dc-labelchip" />
      <text x={x} y={y} textAnchor={anchor} className={className}>{text}</text>
    </g>
  );
}

/* =================================================================
   Sparkline — 7 daily mids, one thin polyline, gaps at nulls
   ================================================================= */
export function Sparkline({ points, w = 64, h = 18, className }) {
  const built = useMemo(() => {
    const vals = (points || []).filter((v) => v != null && isFinite(v));
    if (vals.length < 2) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = 2.5; // vertical breathing room so the line/dot never clips the viewBox
    const sy = scaleLinear(lo, hi, h - pad, pad);
    const n = points.length;
    const sx = (i) => (n <= 1 ? 0 : (i / (n - 1)) * w);
    // walk points, breaking the path (moveto) across null gaps
    let d = "";
    let last = null;
    let lastIdx = -1;
    points.forEach((v, i) => {
      if (v == null || !isFinite(v)) return;
      const cmd = d === "" ? "M" : lastIdx === i - 1 ? "L" : "M";
      d += `${cmd}${sx(i).toFixed(2)},${sy(v).toFixed(2)} `;
      last = v;
      lastIdx = i;
    });
    if (!d) return null;
    return { d, dotX: sx(lastIdx), dotY: sy(last) };
  }, [points, w, h]);

  if (!built) {
    // fewer than 2 usable points — keep the cell's layout stable with an empty box
    return <span className="dc-spark dc-spark-empty" style={{ width: w, height: h }} aria-hidden="true" />;
  }
  return (
    <svg className={"dc-spark" + (className ? " " + className : "")} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={built.d} fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={built.dotX} cy={built.dotY} r="1.6" fill="currentColor" />
    </svg>
  );
}

/* =================================================================
   RangeBar — where "now" sits in the week's lo–hi, as a recessed track
   ================================================================= */
export function RangeBar({ lo, hi, now, w = 72, h = 10, label }) {
  const ok = lo != null && hi != null && now != null && isFinite(lo) && isFinite(hi) && isFinite(now) && hi > lo;
  const midY = h / 2;
  if (!ok) {
    return (
      <svg className="dc-range" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {label ? <title>{label}</title> : null}
        <rect className="dc-range-track" x="0.5" y={midY - 1.5} width={w - 1} height="3" rx="1.5" />
      </svg>
    );
  }
  const frac = clamp01((now - lo) / (hi - lo));
  const outOfRange = now < lo || now > hi;
  const x = 3 + frac * (w - 6); // inset so the marker never sits half off the track's ends
  return (
    <svg className="dc-range" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {label ? <title>{label}</title> : null}
      <rect className="dc-range-track" x="0.5" y={midY - 1.5} width={w - 1} height="3" rx="1.5" />
      {outOfRange ? (
        // parked at the edge, hollow-and-warn — "now" broke out of the week's band
        <circle className="dc-range-mark dc-range-mark-warn" cx={x} cy={midY} r="3" />
      ) : (
        // a small diamond marker — reads as a pin without competing with the track
        <rect className="dc-range-mark" x={x - 2.6} y={midY - 2.6} width="5.2" height="5.2" transform={`rotate(45 ${x} ${midY})`} />
      )}
    </svg>
  );
}

/* =================================================================
   CycleChart — 7-day hourly cycle with order lines and per-day fill marks
   ================================================================= */
const VB_W = 640; // fixed viewBox width; the <svg> scales uniformly so text never stretches
const CC_PAD = { l: 46, r: 8, t: 10, b: 32 }; // b leaves room for the fill-mark strip + weekday ticks below it

export function CycleChart({ days, buy, sell, rate, buyDays, sellDays, fmt, height = 220 }) {
  const geo = useMemo(() => buildCycleGeometry(days, buy, sell, rate, height), [days, buy, sell, rate, height]);

  if (!geo) {
    return (
      <div className="dc-empty" style={{ height }} aria-label="Price cycle chart, no data">
        no priced hours in the last 7 days
      </div>
    );
  }
  const { plotB, xOf, yOf, lowPath, highPath, bandPath, yTicks, dayTicks, weekEndX, x0, x1 } = geo;
  const fillRow1 = plotB + 5; // buy marks
  const fillRow2 = plotB + 11; // sell marks
  const weekdayY = plotB + 24;

  return (
    <svg
      className="dc-cycle"
      width="100%"
      viewBox={`0 0 ${VB_W} ${height}`}
      role="img"
      aria-label="Seven day hourly price cycle with insta-buy and insta-sell averages"
    >
      {/* faint band between the two series — just enough to read as "the spread" */}
      {bandPath ? <path d={bandPath} className="dc-cycle-band" /> : null}

      {/* Y gridlines + labels, left side, recessed into the stone rather than boxed */}
      {yTicks.map((t) => (
        <g key={t.v}>
          <line x1={CC_PAD.l} x2={VB_W - CC_PAD.r} y1={t.y} y2={t.y} className="dc-guide" />
          <text x={CC_PAD.l - 6} y={t.y} className="dc-axis-y">{fmt(t.v)}</text>
        </g>
      ))}

      {/* day boundary ticks (one per day start, plus the week's trailing edge) */}
      {dayTicks.map((t) => (
        <line key={t.day} x1={t.x} x2={t.x} y1={CC_PAD.t} y2={plotB} className="dc-daytick" />
      ))}
      <line x1={weekEndX} x2={weekEndX} y1={CC_PAD.t} y2={plotB} className="dc-daytick" />

      {/* the two hourly series */}
      {lowPath ? <path d={lowPath} className="dc-series dc-series-good" /> : null}
      {highPath ? <path d={highPath} className="dc-series dc-series-bad" /> : null}

      {/* the week's going rate — the reference the two orders are read against, dotted and quiet */}
      {rate != null ? (
        <g>
          <line x1={x0} x2={x1} y1={yOf(rate)} y2={yOf(rate)} className="dc-orderline dc-orderline-rate" />
          <TextChip x={x0 + 3} y={yOf(rate) - 3} anchor="start" text={"going " + fmt(rate)} className="dc-orderlabel dc-orderlabel-rate" />
        </g>
      ) : null}

      {/* standing order lines, dashed, brighter+thicker than the series they sit near */}
      {buy != null ? (
        <g>
          <line x1={x0} x2={x1} y1={yOf(buy)} y2={yOf(buy)} className="dc-orderline dc-orderline-good" />
          <TextChip x={x1 - 2} y={yOf(buy) - 3} text={"buy " + fmt(buy)} className="dc-orderlabel dc-orderlabel-good" />
        </g>
      ) : null}
      {sell != null ? (
        <g>
          <line x1={x0} x2={x1} y1={yOf(sell)} y2={yOf(sell)} className="dc-orderline dc-orderline-bad" />
          <TextChip x={x1 - 2} y={yOf(sell) + 11} text={"sell " + fmt(sell)} className="dc-orderlabel dc-orderlabel-bad" />
        </g>
      ) : null}

      {/* per-day fill marks — two thin rows, buy above sell, so a glance shows the week's hit rate */}
      {dayTicks.map((t, i) => {
        const buyFilled = buyDays && buyDays[i];
        const sellFilled = sellDays && sellDays[i];
        return (
          <g key={"fill" + t.day}>
            <circle cx={t.cx} cy={fillRow1} r="2.4" className={"dc-fillmark dc-fillmark-good" + (buyFilled ? " on" : "")} />
            <circle cx={t.cx} cy={fillRow2} r="2.4" className={"dc-fillmark dc-fillmark-bad" + (sellFilled ? " on" : "")} />
          </g>
        );
      })}

      {/* weekday labels, centred under each day, below the fill-mark strip */}
      {dayTicks.map((t) => (
        <text key={"lab" + t.day} x={t.cx} y={weekdayY} className="dc-axis-x" textAnchor="middle">{t.label}</text>
      ))}
    </svg>
  );
}

// geometry builder split out of the component so useMemo has a plain function
// to call — path strings, tick positions, and the y-scale all live here
function buildCycleGeometry(days, buy, sell, rate, height) {
  if (!days || !days.length) return null;
  const plotB = height - CC_PAD.b;
  const plotT = CC_PAD.t;
  const plotH = plotB - plotT;

  // flatten to one hourly timeline; each hour's x comes from its position
  // in the 7*24 grid (days are assumed contiguous — a gap just leaves a hole)
  const hoursPerDay = 24;
  const totalHours = days.length * hoursPerDay;
  const x0 = CC_PAD.l, x1 = VB_W - CC_PAD.r;
  const xOfIdx = scaleLinear(0, totalHours, x0, x1);

  let lo = Infinity, hi = -Infinity;
  const rows = []; // { idx, low, high } for hours that have at least one price
  days.forEach((day, di) => {
    (day.hours || []).forEach((pt) => {
      const hourIdx = di * hoursPerDay + Math.round((pt.timestamp - day.day) / 3600);
      const low = pt.avgLowPrice, high = pt.avgHighPrice;
      if (low != null) { lo = Math.min(lo, low); hi = Math.max(hi, low); }
      if (high != null) { lo = Math.min(lo, high); hi = Math.max(hi, high); }
      rows.push({ idx: hourIdx, low, high });
    });
  });
  if (buy != null) { lo = Math.min(lo, buy); hi = Math.max(hi, buy); }
  if (sell != null) { lo = Math.min(lo, sell); hi = Math.max(hi, sell); }
  if (rate != null) { lo = Math.min(lo, rate); hi = Math.max(hi, rate); }
  if (!isFinite(lo) || !isFinite(hi)) return null; // no priced hours anywhere this week

  if (lo === hi) { lo -= 1; hi += 1; } // degenerate flat week — still give the line room
  const padY = (hi - lo) * 0.08;
  const yLo = lo - padY, yHi = hi + padY;
  const yOf = scaleLinear(yLo, yHi, plotB, plotT);

  rows.sort((a, b) => a.idx - b.idx);
  const buildPath = (key) => {
    let d = "";
    let lastIdx = -2;
    for (const r of rows) {
      const v = r[key];
      if (v == null) continue;
      const cmd = lastIdx === r.idx - 1 ? "L" : "M";
      d += `${cmd}${xOfIdx(r.idx).toFixed(2)},${yOf(v).toFixed(2)} `;
      lastIdx = r.idx;
    }
    return d.trim() || null;
  };
  const lowPath = buildPath("low");
  const highPath = buildPath("high");

  // band between the two series, only over hours where both prices exist —
  // built as a forward walk on low + a reverse walk on high, closed into one loop
  let bandPath = null;
  const both = rows.filter((r) => r.low != null && r.high != null);
  if (both.length >= 2) {
    // split into contiguous runs so the band doesn't bridge across gaps
    const runs = [];
    let cur = [];
    let lastIdx = -2;
    for (const r of both) {
      if (r.idx !== lastIdx + 1 && cur.length) { runs.push(cur); cur = []; }
      cur.push(r);
      lastIdx = r.idx;
    }
    if (cur.length) runs.push(cur);
    bandPath = runs
      .filter((run) => run.length >= 2)
      .map((run) => {
        const fwd = run.map((r) => `${xOfIdx(r.idx).toFixed(2)},${yOf(r.low).toFixed(2)}`).join("L");
        const back = [...run].reverse().map((r) => `${xOfIdx(r.idx).toFixed(2)},${yOf(r.high).toFixed(2)}`).join("L");
        return `M${fwd}L${back}Z`;
      })
      .join(" ") || null;
  }

  const yTicks = niceTicks(yLo, yHi, 3).map((v) => ({ v, y: yOf(v) }));

  // one boundary tick per day start, at its midpoint for the weekday label/fill marks;
  // weekEndX closes off the last day so the grid doesn't look cut off mid-day
  const dayTicks = days.map((day, di) => {
    const startIdx = di * hoursPerDay;
    const x = xOfIdx(startIdx);
    const cx = xOfIdx(startIdx + hoursPerDay / 2);
    const d = new Date(day.day * 1000);
    return { day: day.day, x, cx, label: WEEKDAY[d.getUTCDay()] };
  });
  const weekEndX = xOfIdx(totalHours);

  return { plotH, plotB, xOf: xOfIdx, yOf, lowPath, highPath, bandPath, yTicks, dayTicks, weekEndX, x0, x1 };
}

/* =================================================================
   HourProfile — 24 UTC-hour columns, lo/hi step lines, trough/peak tint
   ================================================================= */
const HP_PAD = { l: 4, r: 4, t: 6, b: 20 };

export function HourProfile({ profile, troughH, peakH, fmt, height = 90 }) {
  const geo = useMemo(() => buildHourGeometry(profile, height), [profile, height]);

  if (!geo) {
    return (
      <div className="dc-empty" style={{ height }} aria-label="Hour of day profile, no data">
        no hourly data yet
      </div>
    );
  }
  const { plotB, plotT, xOf, yOf, lowPath, highPath, colW } = geo;

  return (
    <svg className="dc-hourprofile" width="100%" viewBox={`0 0 ${VB_W} ${height}`} role="img" aria-label="Average insta-buy and insta-sell price by hour of day, UTC">
      {[troughH, peakH].map((h, i) =>
        h == null ? null : (
          <rect
            key={i}
            x={xOf(h) - colW / 2}
            y={plotT}
            width={colW}
            height={plotB - plotT}
            className={i === 0 ? "dc-hour-tint dc-hour-tint-good" : "dc-hour-tint dc-hour-tint-bad"}
          />
        )
      )}

      {[0, 6, 12, 18].map((h) => (
        <text key={h} x={xOf(h)} y={height - 4} className="dc-axis-x" textAnchor="middle">{String(h).padStart(2, "0")}</text>
      ))}
      <text x={VB_W - HP_PAD.r} y={height - 4} className="dc-axis-x" textAnchor="end">UTC</text>

      {lowPath ? <path d={lowPath} className="dc-series dc-series-good" /> : null}
      {highPath ? <path d={highPath} className="dc-series dc-series-bad" /> : null}

      {[{ h: troughH, cls: "dc-hourlabel-good" }, { h: peakH, cls: "dc-hourlabel-bad" }].map(({ h, cls }, i) =>
        h == null ? null : (
          <TextChip
            key={i}
            x={xOf(h)}
            y={plotT + 10}
            anchor="middle"
            fontSize={10}
            text={String(h).padStart(2, "0") + ":00"}
            className={"dc-hourlabel " + cls}
          />
        )
      )}
    </svg>
  );
}

function buildHourGeometry(profile, height) {
  if (!profile || !profile.length) return null;
  const priced = profile.filter((p) => p.lo != null || p.hi != null);
  if (!priced.length) return null;

  const plotT = HP_PAD.t;
  const plotB = height - HP_PAD.b;
  const x0 = HP_PAD.l, x1 = VB_W - HP_PAD.r;
  const colW = (x1 - x0) / 24;
  const xOf = (h) => x0 + (h + 0.5) * colW;

  let lo = Infinity, hi = -Infinity;
  priced.forEach((p) => {
    if (p.lo != null) { lo = Math.min(lo, p.lo); hi = Math.max(hi, p.lo); }
    if (p.hi != null) { lo = Math.min(lo, p.hi); hi = Math.max(hi, p.hi); }
  });
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.1;
  const yOf = scaleLinear(lo - padY, hi + padY, plotB, plotT);

  const byHour = new Map(profile.map((p) => [p.h, p]));
  const buildStep = (key) => {
    let d = "";
    let lastH = -2;
    for (let h = 0; h < 24; h++) {
      const p = byHour.get(h);
      const v = p ? p[key] : null;
      if (v == null) continue;
      const cx = xOf(h);
      if (lastH === h - 1) {
        d += `L${cx.toFixed(2)},${yOf(v).toFixed(2)} `;
      } else {
        d += `M${cx.toFixed(2)},${yOf(v).toFixed(2)} `;
      }
      lastH = h;
    }
    return d.trim() || null;
  };

  return { plotT, plotB, xOf, yOf, lowPath: buildStep("lo"), highPath: buildStep("hi"), colW };
}

/* ================= styles injected by the host ================= */
export const CHART_CSS = `
.dc-spark { display:inline-block; vertical-align:middle; overflow:visible; color:var(--tan); }
.dc-spark.good { color:var(--good); }
.dc-spark.bad { color:var(--bad); }
.dc-spark-empty { display:inline-block; vertical-align:middle; }

.dc-range { display:block; overflow:visible; }
.dc-range-track { fill:var(--inset2); stroke:var(--edge); stroke-width:1; }
.dc-range-mark { fill:var(--yellow); stroke:var(--edge); stroke-width:0.75; }
.dc-range-mark-warn { fill:none; stroke:var(--warn); stroke-width:1.5; }

.dc-empty {
  display:flex; align-items:center; justify-content:center; color:var(--dark-tan);
  font-size:12px; background:var(--inset2); border:1px solid var(--edge); border-radius:2px;
}

.dc-cycle, .dc-hourprofile { display:block; background:var(--inset2); border:1px solid var(--edge); border-radius:2px; shape-rendering:crispEdges; }
.dc-cycle text, .dc-hourprofile text { shape-rendering:geometricPrecision; }

.dc-guide { stroke:var(--stone-lo); stroke-width:1; shape-rendering:crispEdges; }
.dc-daytick { stroke:var(--stone-lo); stroke-width:1; shape-rendering:crispEdges; }
.dc-axis-y { font-family:var(--mono); font-size:10px; fill:var(--tan); text-anchor:end; dominant-baseline:middle; }
.dc-axis-x { font-family:var(--mono); font-size:10px; fill:var(--tan); }

.dc-series { fill:none; stroke-width:1.3; opacity:0.85; vector-effect:non-scaling-stroke; stroke-linejoin:round; stroke-linecap:round; }
.dc-series-good { stroke:var(--good); }
.dc-series-bad { stroke:var(--bad); }
.dc-cycle-band { fill:var(--tan); opacity:0.08; stroke:none; }

/* order lines read as "the sticky note on top of the chart" — thicker + fully opaque, dashed to read as a target not a trend */
.dc-orderline { stroke-width:2; stroke-dasharray:6 3; vector-effect:non-scaling-stroke; }
.dc-orderline-good { stroke:var(--good); }
.dc-orderline-bad { stroke:var(--bad); }
.dc-orderline-rate { stroke:var(--yellow); stroke-width:1.25; stroke-dasharray:2 3; opacity:0.75; }
.dc-labelchip { fill:var(--inset2); }
.dc-orderlabel { font-family:var(--mono); font-size:10.5px; }
.dc-orderlabel-good { fill:var(--good); }
.dc-orderlabel-bad { fill:var(--bad); }
.dc-orderlabel-rate { fill:var(--yellow); }

.dc-fillmark { fill:var(--inset2); stroke:var(--dark-tan); stroke-width:1; }
.dc-fillmark-good.on { fill:var(--good); stroke:var(--good); }
.dc-fillmark-bad.on { fill:var(--bad); stroke:var(--bad); }

.dc-hour-tint { opacity:0.16; stroke:none; }
.dc-hour-tint-good { fill:var(--good); }
.dc-hour-tint-bad { fill:var(--bad); }
.dc-hourlabel { font-family:var(--mono); font-size:10px; font-weight:600; }
.dc-hourlabel-good { fill:var(--good); }
.dc-hourlabel-bad { fill:var(--bad); }
`;
