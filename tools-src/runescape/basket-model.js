// Basket model: turns per-item daily price history into GEBs — Grand
// Exchange Baskets — for the Job Board's Commodities tab.
//
// A GEB is a fixed load of goods priced at each day's going rate, set to 100
// at the start of the window. "By flow" weights each good by the units it
// trades on a typical day (fixed for the window, so a riser can't vote
// itself heavier as it rises): the basket reads as the cost of a typical
// day's flow through that family. "Equal" is the geometric mean of every
// good's price relative: what the typical item in the family is doing,
// feathers counting the same as runite. Both are chain-linked day by day
// over whichever goods have a price on both days, so a thin day or a young
// item shifts the level by its own move and never by its absence.
//
// A price is carried forward across a gap of up to MAX_GAP days (the wiki
// aggregates a day a day or two late, and a slow book skips days); beyond
// that the good is simply absent until it trades again. Nothing here
// throws on thin or missing input — an item with no history comes back
// null, not a crash.

export const DAY = 86400;
export const MAX_GAP = 7;     // days a missing price is carried forward
export const BAND_DAYS = 90;  // trailing days a "usual" band is read from
export const BAND_MIN = 20;   // fewer days than this and no band is claimed
export const HISTORY_DAYS = 365; // the wiki's daily timeseries reaches back a year

// the volume-weighted mid of a day's two sides, as day-model's weekStats
// takes it: skewed toward whichever side actually traded more, or whichever
// single side is present
export function midOf(lo, hi, vLo, vHi) {
  if (lo != null && hi != null) {
    const v = (vLo || 0) + (vHi || 0);
    return v > 0 ? (lo * (vLo || 0) + hi * (vHi || 0)) / v : (lo + hi) / 2;
  }
  return lo != null ? lo : hi != null ? hi : null;
}

// the wiki's /timeseries?timestep=24h points → [{t, mid, vol}], oldest first
export function dailyFromTimeseries(points) {
  const out = [];
  for (const p of Array.isArray(points) ? points : []) {
    if (!p || p.timestamp == null) continue;
    out.push({
      t: Math.floor(p.timestamp / DAY) * DAY,
      mid: midOf(p.avgLowPrice, p.avgHighPrice, p.lowPriceVolume, p.highPriceVolume),
      vol: (p.lowPriceVolume || 0) + (p.highPriceVolume || 0),
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// the board's week rows ([lo, hi, vLo, vHi] or null, aligned with `days`) → the same shape
export function dailyFromWeek(week, days) {
  const out = [];
  if (!Array.isArray(week) || !Array.isArray(days)) return out;
  for (let i = 0; i < week.length && i < days.length; i++) {
    const w = week[i];
    if (!w || days[i] == null) continue;
    out.push({ t: days[i], mid: midOf(w[0], w[1], w[2], w[3]), vol: (w[2] || 0) + (w[3] || 0) });
  }
  return out;
}

// two daily series into one: the first wins a day both have
export function mergeDaily(a, b) {
  const byT = new Map();
  for (const p of b || []) if (p && p.t != null) byT.set(p.t, p);
  for (const p of a || []) if (p && p.t != null) byT.set(p.t, p);
  return [...byT.values()].sort((x, y) => x.t - y.t);
}

// today's live read as the series' last point (a partial day the wiki
// hasn't aggregated yet), replacing anything at or after it
export function withToday(daily, t, mid, vol) {
  const out = (daily || []).filter((p) => p && p.t < t);
  if (mid != null) out.push({ t, mid, vol: vol || 0 });
  return out;
}

export function windowDays(from, to) {
  const out = [];
  for (let t = from; t <= to; t += DAY) out.push(t);
  return out;
}

// a daily series laid onto a day grid: mids carried forward across short
// gaps, vols only where the day really traded, `real` saying which is which
export function alignDaily(daily, days, maxGap = MAX_GAP) {
  const n = days.length;
  const mids = new Array(n).fill(null), vols = new Array(n).fill(0), real = new Array(n).fill(false);
  if (!Array.isArray(daily) || n === 0) return { mids, vols, real };
  const byT = new Map();
  let last = null, lastT = null;
  for (const p of daily) {
    if (!p || p.t == null) continue;
    byT.set(p.t, p);
    // the freshest price before the grid starts seeds the carry, so the
    // window's first day isn't blank just because the item traded yesterday
    if (p.t < days[0] && p.mid != null && (lastT == null || p.t > lastT)) { last = p.mid; lastT = p.t; }
  }
  for (let i = 0; i < n; i++) {
    const d = days[i], p = byT.get(d);
    if (p && p.mid != null) {
      mids[i] = p.mid; vols[i] = p.vol || 0; real[i] = true; last = p.mid; lastT = d;
    } else if (last != null && d - lastT <= maxGap * DAY) {
      mids[i] = last;
    }
  }
  return { mids, vols, real };
}

const firstIdx = (arr) => { for (let i = 0; i < arr.length; i++) if (arr[i] != null) return i; return -1; };
const lastIdx = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; };

// a series' move across the window: last price over first, as a percentage
export function windowReturn(mids) {
  const f = firstIdx(mids), l = lastIdx(mids);
  if (f < 0 || l <= f || !(mids[f] > 0)) return null;
  return (mids[l] / mids[f] - 1) * 100;
}

// ---------------------------------------------------------------------------
// basketLevels — the GEB itself: chain-linked levels from 100, the move, and
// the breadth (how many members rose, fell, or held within ±0.5%).
// ---------------------------------------------------------------------------
export function basketLevels(members, weighting = "flow") {
  const list = (members || []).filter((m) => m && Array.isArray(m.mids));
  const len = list.reduce((mx, m) => Math.max(mx, m.mids.length), 0);
  const levels = new Array(len).fill(null);
  const out = { levels, ret: null, n: list.length, priced: 0, weights: [], breadth: { up: 0, down: 0, flat: 0, n: 0 } };
  if (len === 0 || list.length === 0) return out;

  // fixed quantity weights: a member's typical daily units across the window
  const w = list.map((m) => {
    let s = 0, c = 0;
    for (let i = 0; i < m.mids.length; i++) if (m.vols && m.vols[i] > 0) { s += m.vols[i]; c++; }
    return c > 0 ? s / c : 0;
  });
  out.weights = w;

  let level = null;
  for (let k = 0; k < len; k++) {
    if (level == null) {
      if (list.some((m) => m.mids[k] != null)) level = 100;
      levels[k] = level;
      continue;
    }
    let ratio = 1;
    if (weighting === "equal") {
      let s = 0, c = 0;
      for (const m of list) {
        const a = m.mids[k - 1], b = m.mids[k];
        if (a > 0 && b > 0) { s += Math.log(b / a); c++; }
      }
      if (c > 0) ratio = Math.exp(s / c);
    } else {
      let num = 0, den = 0;
      for (let i = 0; i < list.length; i++) {
        const m = list[i], a = m.mids[k - 1], b = m.mids[k];
        if (a != null && b != null && w[i] > 0) { num += w[i] * b; den += w[i] * a; }
      }
      if (den > 0) ratio = num / den;
    }
    level *= ratio;
    levels[k] = level;
  }

  for (const m of list) {
    const r = windowReturn(m.mids);
    if (r == null) continue;
    out.priced++;
    out.breadth.n++;
    if (r > 0.5) out.breadth.up++; else if (r < -0.5) out.breadth.down++; else out.breadth.flat++;
  }
  out.ret = windowReturn(levels);
  return out;
}

// ---------------------------------------------------------------------------
// zScores — today against its own recent past: how many standard deviations
// today's price sits from the trailing BAND_DAYS complete days, and how far
// this week's typical daily volume sits from the BAND_DAYS before the week
// (the week is judged against what came before it, not against itself).
// Volume is judged on its log — a book's flow is skewed, and a doubling
// should read the same whether it's 1k → 2k or 100k → 200k. The week's
// figure must come from the same daily rows the history does: the wiki's
// rolling 24-hour volume runs on another scale entirely.
// ---------------------------------------------------------------------------
const stats = (arr) => {
  const n = arr.length;
  if (n === 0) return null;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { mean, sd, n };
};
// a spread of goods that is only rounding noise counts as none at all
const spreadOf = (st) => (st.sd > Math.max(1e-9, Math.abs(st.mean) * 1e-9) ? st.sd : 0);
const zOf = (arr, v) => {
  if (v == null || arr.length < BAND_MIN) return null;
  const st = stats(arr), sd = spreadOf(st);
  return sd > 0 ? (v - st.mean) / sd : 0;
};

export function zScores(daily, todayT, mid, weekVol, lookback = BAND_DAYS, weekDays = 7) {
  const from = todayT - lookback * DAY, weekFrom = todayT - weekDays * DAY;
  const px = [], lv = [];
  for (const p of daily || []) {
    if (!p || p.t >= todayT || p.t < from - weekDays * DAY) continue;
    if (p.t >= from && p.mid != null) px.push(p.mid);
    if (p.t < weekFrom && p.vol > 0) lv.push(Math.log(p.vol));
  }
  return { pz: zOf(px, mid), vz: weekVol > 0 ? zOf(lv, Math.log(weekVol)) : null, n: px.length };
}

// ---------------------------------------------------------------------------
// spreadSeries — a recipe-linked pair across the grid: per day, what one
// action pays (output × yield, less inputs and the NPC's fee) and the ratio
// of what it makes to what it costs; then today's ratio against its usual
// band (the trailing BAND_DAYS complete days).
// ---------------------------------------------------------------------------
export function spreadSeries(pair, midsOf, days) {
  const out = midsOf(pair.out);
  if (!out) return null;
  const ins = [];
  for (const [name, qty] of pair.ins) {
    const m = midsOf(name);
    if (!m) return null;
    ins.push({ mids: m, qty });
  }
  const n = days.length, y = pair.yield || 1, fee = pair.fee || 0;
  const margins = new Array(n).fill(null), ratios = new Array(n).fill(null);
  for (let k = 0; k < n; k++) {
    const o = out[k];
    if (o == null) continue;
    let cost = fee, ok = true;
    for (const x of ins) { const m = x.mids[k]; if (m == null) { ok = false; break; } cost += m * x.qty; }
    if (!ok) continue;
    const rev = o * y;
    margins[k] = rev - cost;
    ratios[k] = cost > 0 ? rev / cost : null;
  }
  const li = lastIdx(ratios);
  const hist = [];
  if (li > 0) for (let k = Math.max(0, li - BAND_DAYS); k < li; k++) if (ratios[k] != null) hist.push(ratios[k]);
  const band = hist.length >= BAND_MIN ? stats(hist) : null;
  const z = band && li >= 0 ? (spreadOf(band) > 0 ? (ratios[li] - band.mean) / spreadOf(band) : 0) : null;
  return {
    margins, ratios,
    last: li >= 0 ? { margin: margins[li], ratio: ratios[li], cost: li >= 0 ? (out[li] * y - margins[li]) : null } : null,
    band, z,
  };
}

// every Wednesday in [from, to], at about the hour the weekly update lands
// (11:30 UK, taken as UTC — close enough for a marker)
export function wednesdays(from, to) {
  const out = [];
  for (let t = from; t <= to; t += DAY) if (new Date(t * 1000).getUTCDay() === 3) out.push(t + 11.5 * 3600);
  return out;
}

// a long series thinned to at most `n` points by bucket mean (nulls ignored,
// an empty bucket stays null) — a year fits a sparkline without a 365-segment path
export function thin(arr, n) {
  if (!Array.isArray(arr) || arr.length <= n) return arr || [];
  const out = [];
  const size = arr.length / n;
  for (let b = 0; b < n; b++) {
    const s = Math.floor(b * size), e = Math.max(s + 1, Math.floor((b + 1) * size));
    let sum = 0, c = 0;
    for (let i = s; i < e && i < arr.length; i++) if (arr[i] != null) { sum += arr[i]; c++; }
    out.push(c > 0 ? sum / c : null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildCommodities — the whole tab's read in one pass. `resolve(name)` hands
// back the board's assessed item for a name (or null); `hist` maps item id →
// the wiki's daily timeseries points, present for whichever items have been
// fetched so far. Everything is aligned on one day grid reaching back
// HISTORY_DAYS from today; the window is its tail.
// ---------------------------------------------------------------------------
export function buildCommodities({ families, stages, pairs, resolve, hist, weekDays, now, window: W, weighting }) {
  const today = Math.floor(now / DAY) * DAY;
  const gridFrom = today - HISTORY_DAYS * DAY;
  const days = windowDays(gridFrom, today);
  const wStart = Math.max(0, days.length - 1 - W);
  const winDays = days.slice(wStart);
  const N = winDays.length;

  const cache = new Map(); // name → entry | null
  let withHistory = 0, resolved = 0;
  const entryFor = (name) => {
    if (cache.has(name)) return cache.get(name);
    const it = resolve(name);
    if (!it) { cache.set(name, null); return null; }
    resolved++;
    const ts = hist?.get(it.id);
    let daily = dailyFromWeek(it.week, weekDays);
    if (ts) { daily = mergeDaily(dailyFromTimeseries(ts), daily); withHistory++; }
    // today's point is the live tape's mid; its volume is the week's typical
    // day, the only figure on the daily rows' scale the board has for it
    daily = withToday(daily, today, it.mid, it.dv7 || 0);
    const al = alignDaily(daily, days);
    const win = { mids: al.mids.slice(wStart), vols: al.vols.slice(wStart), real: al.real.slice(wStart) };
    const e = {
      name, it, daily, all: al, win,
      hasHistory: !!ts,
      ret: windowReturn(win.mids),
      z: zScores(daily, today, it.mid, it.dv7 || 0),
      spark: thin(win.mids, 40),
      // the first day the window actually prices this item — a young book's
      // move covers less than the window
      since: (() => { const f = firstIdx(win.mids); return f >= 0 ? winDays[f] : null; })(),
    };
    cache.set(name, e);
    return e;
  };

  const basketOf = (members) => {
    const lv = basketLevels(members.map((m) => m.win), weighting);
    return { ...lv, spark: thin(lv.levels, 60) };
  };
  const tileOf = (e, famRet) => ({
    ...e,
    vsFamily: e.ret != null && famRet != null ? e.ret - famRet : null,
  });

  const fams = families.map((f) => {
    const cells = stages.map((s) => ({ stage: s.key, name: s.name, items: (f.stages[s.key] || []).map(entryFor).filter(Boolean) }));
    const members = cells.flatMap((c) => c.items);
    const level = basketOf(members);
    return {
      ...f, level, members,
      cells: cells.map((c) => ({ ...c, items: c.items.map((e) => tileOf(e, level.ret)) })),
    };
  });
  const gridMembers = fams.flatMap((f) => f.members);
  const all = basketOf(gridMembers);
  const stageBaskets = stages.map((s, i) => {
    const members = fams.flatMap((f) => f.cells[i].items);
    return { ...s, level: basketOf(members), n: members.length };
  });

  // pairs are read on the whole grid so the usual band is always BAND_DAYS
  // deep, whatever the window; the window only decides the sparkline
  const midsOf = (name) => entryFor(name)?.all.mids || null;
  const spreads = pairs.map((p) => {
    const s = spreadSeries(p, midsOf, days);
    if (!s) return null;
    const outE = entryFor(p.out);
    return {
      ...p, ...s, outItem: outE?.it || null,
      ins: p.ins.map(([name, qty]) => ({ name, qty, item: entryFor(name)?.it || null })),
      winRatios: s.ratios.slice(wStart), winMargins: s.margins.slice(wStart),
      spark: thin(s.ratios.slice(wStart), 40),
    };
  }).filter(Boolean);

  return {
    today, days: winDays, n: N, weighting,
    families: fams, all, stages: stageBaskets, spreads,
    coverage: { resolved, withHistory, total: cache.size },
    events: wednesdays(winDays[0], today),
  };
}
