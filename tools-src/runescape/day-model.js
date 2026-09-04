// Day-model: turns hourly GE price/volume history into "what standing order
// would have filled" numbers for the Flip Desk's day-to-day view.
//
// The GE is price-time priority. In the wiki's data, a "low" trade is an
// insta-sell (someone hit a standing BUY), a "high" trade is an insta-buy
// (someone hit a standing SELL). So: your buy at price P fills during any
// hour where sellers were insta-selling at an average price <= P — you'd
// have been the best bid, first in the queue, for that hour's low-side flow.
// Your sell at S fills when buyers were insta-buying at an average >= S.
// Other flippers camp the same levels, so we assume you only capture a
// fraction (`capture`, default 0.5) of an hour's matching volume — the rest
// goes to whoever else was resting there.
//
// Nothing here throws on empty/malformed input: a thin item (or a brand new
// listing) should just come back all-null, not crash the board.

export const DAY = 86400;

// ---------------------------------------------------------------------------
// weekStats — 7-day board stats for one item, from its daily "week" rows.
// Runs for ~4,000 items every refresh, so: single pass, no intermediate
// arrays/objects beyond what we need to return.
// ---------------------------------------------------------------------------
export function weekStats(week, taxOf) {
  const out = {
    n: 0, n2: 0, rate: null, rateLo: null, rateHi: null, trend: null,
    rangeLo: null, rangeHi: null, dayMargin: null, dayRoi: null,
    dv: 0, vLo: 0, vHi: 0, mids: [],
  };
  if (!Array.isArray(week) || week.length === 0) return out;

  let sumPV = 0, sumV = 0;                 // for `rate` (volume-weighted mid)
  let sumLoPV = 0, sumLoV = 0;              // for `rateLo`
  let sumHiPV = 0, sumHiV = 0;              // for `rateHi`
  let sumVLo = 0, sumVHi = 0, volDays = 0;  // for dv/vLo/vHi
  let marginSum = 0, marginDays = 0;        // for dayMargin
  // least-squares trend needs (x, y) pairs — x is the position of the mid
  // WITHIN THE SEQUENCE OF PRESENT MIDS (0, 1, 2, ...), not the raw day
  // index, so a single no-data day in the middle of the week doesn't yank
  // the fitted line toward it as an artificial gap.
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, midCount = 0;

  for (let i = 0; i < week.length; i++) {
    const row = week[i];
    if (!row) { out.mids.push(null); continue; }
    const [lo, hi, vLo0, vHi0] = row;
    const vLo = vLo0 || 0, vHi = vHi0 || 0;
    const vSum = vLo + vHi;
    if (vSum > 0) out.n++;
    if (lo != null && hi != null) out.n2++;

    if (vSum > 0) { sumVLo += vLo; sumVHi += vHi; volDays++; }
    if (lo != null && vLo > 0) { sumLoPV += lo * vLo; sumLoV += vLo; }
    if (hi != null && vHi > 0) { sumHiPV += hi * vHi; sumHiV += vHi; }
    if (lo != null && vLo > 0) { sumPV += lo * vLo; sumV += vLo; }
    if (hi != null && vHi > 0) { sumPV += hi * vHi; sumV += vHi; }
    if (lo != null) {
      out.rangeLo = out.rangeLo == null ? lo : Math.min(out.rangeLo, lo);
    }
    if (hi != null) {
      out.rangeHi = out.rangeHi == null ? hi : Math.max(out.rangeHi, hi);
    }
    if (lo != null && hi != null) {
      marginSum += hi - lo - taxOf(hi);
      marginDays++;
    }

    // mid for the sparkline + trend: volume-weighted of the two sides when
    // both exist (skews toward whichever side actually traded more), else
    // whichever single side is present.
    let mid = null;
    if (lo != null && hi != null) {
      mid = vSum > 0 ? (lo * vLo + hi * vHi) / vSum : (lo + hi) / 2;
    } else if (lo != null) mid = lo;
    else if (hi != null) mid = hi;
    out.mids.push(mid);
    if (mid != null) {
      const x = midCount; // compact index among present mids
      sumX += x; sumY += mid; sumXY += x * mid; sumXX += x * x;
      midCount++;
    }
  }

  out.rate = sumV > 0 ? sumPV / sumV : null;
  out.rateLo = sumLoV > 0 ? sumLoPV / sumLoV : null;
  out.rateHi = sumHiV > 0 ? sumHiPV / sumHiV : null;
  out.dv = volDays > 0 ? (sumVLo + sumVHi) / volDays : 0;
  out.vLo = volDays > 0 ? sumVLo / volDays : 0;
  out.vHi = volDays > 0 ? sumVHi / volDays : 0;
  out.dayMargin = marginDays > 0 ? marginSum / marginDays : null;
  out.dayRoi = out.dayMargin != null && out.rateLo != null && out.rateLo !== 0
    ? (out.dayMargin / out.rateLo) * 100 : null;

  if (midCount >= 3) {
    // least-squares slope of mid vs day-index, then express the fit's total
    // rise across the window as a % of the mean mid.
    const denom = midCount * sumXX - sumX * sumX;
    if (denom !== 0) {
      const slope = (midCount * sumXY - sumX * sumY) / denom;
      const meanY = sumY / midCount;
      out.trend = meanY !== 0 ? (slope * (midCount - 1) / meanY) * 100 : null;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// completeDays — bucket hourly points into complete UTC days.
// A day counts as "complete" only when it's fully in the past (day + DAY <=
// now) AND the series actually starts covering it from hour 0 — otherwise a
// leading partial day (the API's window just happens to start mid-day) would
// silently look like a full day with lower volume.
// ---------------------------------------------------------------------------
export function completeDays(hours, now) {
  if (!Array.isArray(hours) || hours.length === 0) return [];

  const byDay = new Map(); // dayStart -> hour[]
  let firstDay = null, lastDay = null, firstHourOfFirstDay = null;
  for (const p of hours) {
    if (!p || p.timestamp == null) continue;
    const day = Math.floor(p.timestamp / DAY) * DAY;
    if (firstDay == null || day < firstDay) firstDay = day;
    if (lastDay == null || day > lastDay) lastDay = day;
    if (day === firstDay) {
      if (firstHourOfFirstDay == null || p.timestamp < firstHourOfFirstDay) {
        firstHourOfFirstDay = p.timestamp;
      }
    }
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(p);
  }
  if (firstDay == null) return [];
  // the leading day is only usable if its earliest point IS that day's 00:00
  const leadingDayUsable = firstHourOfFirstDay === firstDay;

  // Walk every calendar day from first to last seen — including days with no
  // points at all (an hour the feed skipped entirely) — so a silent gap
  // reads as "no trades that day", not as a missing day the caller has to
  // notice on its own.
  const out = [];
  for (let day = firstDay; day <= lastDay; day += DAY) {
    if (day + DAY > now) continue;          // still in progress
    if (day === firstDay && !leadingDayUsable) continue; // partial leading day
    out.push({ day, hours: byDay.get(day) || [] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// dayFills — per-day cheapest-buy / dearest-sell fill price for quantity qty,
// assuming you only capture `capture` of each hour's matching volume.
// ---------------------------------------------------------------------------
export function dayFills(days, qty, capture) {
  if (!Array.isArray(days)) return [];
  return days.map(({ day, hours }) => {
    const hs = Array.isArray(hours) ? hours : [];
    let vLo = 0, vHi = 0;
    for (const h of hs) { vLo += h?.lowPriceVolume || 0; vHi += h?.highPriceVolume || 0; }

    // buy: work the cheapest hours first — first hour whose cumulative
    // (captured) sell-side volume reaches qty sets the fill price. Round UP
    // so the rounded order is never more optimistic than the evidence.
    const buyHours = hs
      .filter((h) => h && h.avgLowPrice != null && (h.lowPriceVolume || 0) > 0)
      .sort((a, b) => a.avgLowPrice - b.avgLowPrice);
    let buy = null, acc = 0;
    for (const h of buyHours) {
      acc += h.lowPriceVolume * capture;
      if (acc >= qty) { buy = Math.ceil(h.avgLowPrice); break; }
    }

    // sell: dearest hours first, buy-side volume, round DOWN.
    const sellHours = hs
      .filter((h) => h && h.avgHighPrice != null && (h.highPriceVolume || 0) > 0)
      .sort((a, b) => b.avgHighPrice - a.avgHighPrice);
    let sell = null; acc = 0;
    for (const h of sellHours) {
      acc += h.highPriceVolume * capture;
      if (acc >= qty) { sell = Math.floor(h.avgHighPrice); break; }
    }

    return { day, buy, sell, vLo, vHi };
  });
}

// ---------------------------------------------------------------------------
// cycleOrders — the order that would have filled on k of the given days.
// ---------------------------------------------------------------------------
export function cycleOrders(fills, k, taxOf) {
  const arr = Array.isArray(fills) ? fills : [];
  const n = arr.length;
  const out = {
    n, k, buy: null, sell: null, tax: 0, margin: null, roi: null,
    buyDays: arr.map(() => false), sellDays: arr.map(() => false),
    buyAble: 0, sellAble: 0,
  };

  const buys = arr.map((f) => f.buy).filter((v) => v != null);
  const sells = arr.map((f) => f.sell).filter((v) => v != null);
  out.buyAble = buys.length;
  out.sellAble = sells.length;

  // a buy at P fills day d iff fill.buy <= P — so the price that fills on
  // (at least) k days is the k-th SMALLEST buy fill (sorted ascending, index
  // k-1): every day at or below it also clears the bar.
  if (buys.length >= k) {
    buys.sort((a, b) => a - b);
    out.buy = buys[k - 1];
  }
  // symmetric: sell at S fills iff fill.sell >= S, so the k-th LARGEST.
  if (sells.length >= k) {
    sells.sort((a, b) => b - a);
    out.sell = sells[k - 1];
  }

  for (let i = 0; i < n; i++) {
    const f = arr[i];
    if (out.buy != null) out.buyDays[i] = f.buy != null && f.buy <= out.buy;
    if (out.sell != null) out.sellDays[i] = f.sell != null && f.sell >= out.sell;
  }

  out.tax = out.sell != null ? taxOf(out.sell) : 0;
  if (out.buy != null && out.sell != null) {
    out.margin = out.sell - out.buy - out.tax;
    out.roi = out.buy !== 0 ? (out.margin / out.buy) * 100 : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// hourProfile — average price by UTC hour-of-day, to spot when a market
// tends to be cheap/dear within the day.
// ---------------------------------------------------------------------------
export function hourProfile(days) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, lo: null, hi: null, vLo: 0, vHi: 0 }));
  const out = { hours, troughH: null, peakH: null };
  if (!Array.isArray(days) || days.length === 0) return out;

  const sumLoPV = new Array(24).fill(0), sumLoV = new Array(24).fill(0);
  const sumHiPV = new Array(24).fill(0), sumHiV = new Array(24).fill(0);
  for (const { hours: hs } of days) {
    for (const p of hs || []) {
      if (!p || p.timestamp == null) continue;
      const h = Math.floor((p.timestamp % DAY) / 3600);
      const vLo = p.lowPriceVolume || 0, vHi = p.highPriceVolume || 0;
      if (p.avgLowPrice != null && vLo > 0) { sumLoPV[h] += p.avgLowPrice * vLo; sumLoV[h] += vLo; }
      if (p.avgHighPrice != null && vHi > 0) { sumHiPV[h] += p.avgHighPrice * vHi; sumHiV[h] += vHi; }
    }
  }
  for (let h = 0; h < 24; h++) {
    hours[h].lo = sumLoV[h] > 0 ? sumLoPV[h] / sumLoV[h] : null;
    hours[h].hi = sumHiV[h] > 0 ? sumHiPV[h] / sumHiV[h] : null;
    hours[h].vLo = sumLoV[h];
    hours[h].vHi = sumHiV[h];
  }

  // 3-hour circular moving average so one thin hour can't crown itself the
  // trough/peak — average whatever neighbours actually have a price.
  const smooth = (arr) => arr.map((_, h) => {
    let sum = 0, cnt = 0;
    for (const d of [-1, 0, 1]) {
      const v = arr[(h + d + 24) % 24];
      if (v != null) { sum += v; cnt++; }
    }
    return cnt > 0 ? sum / cnt : null;
  });
  const loSmooth = smooth(hours.map((x) => x.lo));
  const hiSmooth = smooth(hours.map((x) => x.hi));

  for (let h = 0; h < 24; h++) {
    if (loSmooth[h] != null && (out.troughH == null || loSmooth[h] < loSmooth[out.troughH])) out.troughH = h;
    if (hiSmooth[h] != null && (out.peakH == null || hiSmooth[h] > hiSmooth[out.peakH])) out.peakH = h;
  }
  return out;
}

// ---------------------------------------------------------------------------
// holdout — fit the cycle rule on an older window, test it on the next 7
// days, and see whether it kept its promise out of sample.
// ---------------------------------------------------------------------------
export function holdout(days, qty, capture, k, taxOf) {
  if (!Array.isArray(days)) return null;
  const older = days.slice(-14, -7);
  const newer = days.slice(-7);
  if (older.length < 4) return null;

  const kOld = Math.max(1, Math.round(k * older.length / 7));
  const olderFills = dayFills(older, qty, capture);
  const orders = cycleOrders(olderFills, kOld, taxOf);

  const newerFills = dayFills(newer, qty, capture);
  let buyHits = 0, sellHits = 0;
  for (const f of newerFills) {
    if (orders.buy != null && f.buy != null && f.buy <= orders.buy) buyHits++;
    if (orders.sell != null && f.sell != null && f.sell >= orders.sell) sellHits++;
  }

  return { n: newer.length, buyHits, sellHits, orders };
}
