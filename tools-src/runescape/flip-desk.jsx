import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar, Cell,
  ComposedChart, Line,
} from "recharts";

/* ================= baked snapshot (captured 20 Aug 2026, OSRS Wiki real-time prices) ================= */
const SNAPSHOT = {"ts":1787256798,"items":[[7936,"Pure essence",30000,0,1,1,1701405,126652635,100.0,1686],[52,"Arrow shaft",7000,1,1,2,411071,17828938,0.0,7],[314,"Feather",30000,0,2,3,5264562,171989093,50.0,6],[1779,"Flax",13000,1,2,2,161014,12055660,0.0,4],[558,"Mind rune",18000,0,3,3,1179418,39912950,0.0,5],[227,"Vial of water",13000,0,3,4,168300,18244533,0.0,10],[884,"Iron arrow",7000,0,3,4,139130,7242944,33.33,5],[1993,"Jug of wine",6000,0,3,4,201629,6635470,14.29,13],[1939,"Swamp tar",13000,1,4,4,164388,8836481,0.0,5],[559,"Body rune",18000,0,4,5,147306,8206687,12.5,9],[313,"Fishing bait",8000,0,4,5,71607,7591477,11.11,14],[882,"Bronze arrow",7000,0,4,4,48038,3723591,10.0,11],[221,"Eye of newt",13000,0,4,4,36077,1901887,33.33,5],[556,"Air rune",50000,0,5,6,2706311,258199938,0.0,5],[554,"Fire rune",50000,0,5,5,2363189,165931480,0.0,5],[555,"Water rune",50000,0,5,6,3187150,161343898,0.0,7],[557,"Earth rune",50000,0,5,6,987281,72738399,9.09,6],[888,"Mithril arrow",7000,0,6,6,262994,15783835,0.0,5],[1783,"Bucket of sand",13000,1,7,7,56590,4972081,6.67,6],[4696,"Dust rune",18000,1,8,8,624195,15640517,0.0,9],[809,"Mithril dart",7000,1,8,9,247521,14644288,6.67,6],[886,"Steel arrow",7000,0,8,8,97074,3711361,0.0,5],[4820,"Iron nails",13000,1,9,10,83540,1734894,16.67,5],[807,"Iron dart",7000,1,9,11,17801,1905968,15.79,9],[53,"Headless arrow",11000,1,11,12,536705,19554714,0.0,11],[1517,"Maple logs",15000,0,11,12,272073,18926363,0.0,6],[1937,"Jug of water",13000,0,14,15,366829,11941822,7.14,5],[27616,"Ancient essence",300000,1,18,18,865777,81427440,2.86,5],[1941,"Swamp paste",13000,1,20,23,231215,6920335,33.33,6],[890,"Adamant arrow",11000,0,26,27,185692,14676886,1.85,4],[4699,"Lava rune",18000,1,27,29,371822,12471756,16.67,10],[810,"Adamant dart",11000,1,28,30,232699,20301477,0.0,6],[1539,"Steel nails",13000,0,30,31,124239,4932496,0.0,5],[28157,"Forester's ration",6000,1,35,43,409095,7022445,15.79,73],[892,"Rune arrow",11000,1,42,47,625893,26721435,1.18,5],[11875,"Broad bolts",7000,1,54,55,101440,1856638,13.45,7],[440,"Iron ore",13000,0,69,70,116850,9331874,0.71,5],[2357,"Gold bar",10000,0,81,86,306826,16251629,2.33,5],[1775,"Molten glass",13000,1,87,93,89939,5027041,0.0,6],[379,"Lobster",6000,0,92,96,15873,984779,0.53,5],[562,"Chaos rune",18000,0,103,105,2145763,99473367,0.48,4],[9075,"Astral rune",25000,1,107,111,396522,22207366,1.38,6],[1515,"Yew logs",12000,0,109,112,156205,10661003,1.35,5],[1761,"Soft clay",13000,0,114,115,218908,3933498,3.77,7],[563,"Law rune",18000,0,123,127,944403,28433422,1.6,5],[564,"Cosmic rune",18000,0,124,125,527523,21129119,1.23,5],[10127,"Dashing kebbit fur",10000,1,128,167,3523,162976,-1,25],[21326,"Amethyst arrow",11000,1,132,145,550775,15656193,0.72,5],[9243,"Diamond bolts (e)",11000,1,136,142,145585,3511626,1.09,6],[561,"Nature rune",18000,0,146,149,1506880,49697901,0.68,5],[453,"Coal",13000,0,147,149,808392,49941139,1.33,4],[1739,"Cowhide",13000,0,149,178,5103,395082,8.28,8],[444,"Gold ore",30000,0,150,154,544587,24658239,0.33,5],[31967,"Oak repair kit",13000,1,152,206,92,33556,40.14,117],[9242,"Ruby bolts (e)",11000,1,156,158,69163,2838967,2.28,7],[7946,"Monkfish",13000,1,159,160,76473,1611451,1.54,9],[12934,"Zulrah's scales",30000,1,161,166,1769444,64378845,0.61,5],[1777,"Bow string",13000,1,167,168,129642,5199510,0.3,13],[30800,"Demonic tallow",11000,1,183,228,44239,379132,7.55,13],[560,"Death rune",25000,0,185,188,2075985,77622848,0.0,4],[1609,"Opal",13000,1,223,259,1444,138866,6.64,8],[225,"Limpwurt root",13000,0,226,226,85820,2160556,0.45,4],[532,"Big bones",3000,0,240,241,21229,963761,6.42,5],[11069,"Gold bracelet",18000,1,241,275,3726,331486,-1,46],[6705,"Potato with cheese",13000,1,263,299,1363,148102,5.57,10],[867,"Adamant knife",11000,1,287,338,74,80936,-1,22],[20849,"Dragon thrownaxe",11000,1,308,347,18411,177437,15.15,38],[29895,"Frozen tear",13000,1,321,558,5494,152653,40.87,6],[565,"Blood rune",25000,1,335,338,3603563,110266258,0.15,5],[4460,"Cup of hot water",13000,1,355,395,100,90389,-1,53],[8778,"Oak plank",13000,1,390,394,112641,9096276,0.89,5],[3144,"Cooked karambwan",10000,1,414,426,121779,3007347,2.2,6],[10816,"Raw yak meat",11000,1,421,776,0,53127,-1,221],[2162,"King worm",13000,1,441,520,6225,94200,-1,23],[21352,"Amethyst javelin tips",10000,1,539,590,990,1035269,1.64,45],[12640,"Amylase crystal",11000,1,579,599,45012,2206416,1.85,11],[2353,"Steel bar",10000,0,580,589,234798,8191560,0.52,4],[21802,"Revenant cave teleport",15000,1,639,674,4885,223515,0.23,9],[22266,"Redwood shield",18000,1,643,729,702,60531,-1,69],[4842,"Relicym's balm(4)",2000,1,662,931,782,26579,19.13,5],[383,"Raw shark",15000,1,692,700,123998,4425063,1.51,6],[21090,"Opal necklace",10000,1,701,950,1001,20668,-1,119],[231,"Snape grass",13000,1,709,710,60862,3609361,0.71,4],[21336,"Amethyst arrow(p++)",11000,1,715,795,601,72757,4.33,30],[181,"Superantipoison(3)",2000,1,735,970,153,22689,-1,47],[5641,"Rune dart(p++)",11000,1,754,891,0,23410,-1,364],[1513,"Magic logs",12000,1,786,800,178169,7242056,1.58,4],[22929,"Dragonfruit",11000,1,806,888,2491,67202,-1,13],[22603,"Basalt",10000,1,844,936,24768,273527,6.18,41],[8015,"Bones to peaches (tablet)",10000,1,894,949,22972,156801,3.61,6],[21146,"Necklace of passage(5)",10000,1,902,997,1124,43086,8.19,21],[385,"Shark",10000,1,980,990,166700,4304666,0.55,4],[5296,"Toadflax seed",600,1,1000,1000,2772,157003,2.55,6],[824,"Rune dart tip",11000,1,1011,1040,33770,1141841,0.53,10],[7196,"Raw admiral pie",13000,1,1172,1339,0,50590,-1,549],[29110,"Raw pyre fox",13000,1,1208,1331,9710,195308,8.04,14],[29125,"Raw kyatt",13000,1,1210,1349,2813,153126,7.52,10],[11232,"Dragon dart tip",11000,1,1322,1322,50646,3510074,0.34,7],[10034,"Red chinchompa",7000,1,1380,1422,65507,2780610,0.5,9],[24951,"Ourania teleport (tablet)",10000,1,1512,2000,139,20451,17.13,15],[211,"Grimy avantoe",13000,1,1541,1568,24511,677412,3.45,10],[1753,"Green dragonhide",13000,1,1547,1553,18923,541283,0.1,15],[8782,"Mahogany plank",13000,1,1787,1817,293046,15231768,0.69,5],[1751,"Blue dragonhide",13000,1,1814,1828,19712,832738,1.14,16],[13441,"Anglerfish",10000,1,1825,1854,102436,3151988,0.86,6],[2361,"Adamantite bar",10000,0,1879,1888,180380,7312995,1.08,4],[27272,"Lily of the Sands",13000,1,1902,2050,2217,67847,1.32,21],[3402,"Asyn remains",7500,1,2017,3894,5,4056,-1,72],[213,"Grimy kwuarm",13000,1,2060,2198,22184,797638,0.65,11],[21105,"Topaz amulet (u)",10000,1,2076,2242,49,84202,1.67,23],[11228,"Dragon arrow(p+)",11000,1,2098,2363,417,35630,-1,132],[31469,"Cotton yarn",13000,1,2245,2399,2052,73230,-1,63],[19613,"Arceuus library teleport (tablet)",10000,1,2373,2656,216,22859,5.81,21],[21905,"Dragon bolts",11000,1,2660,2664,25876,2019152,0.7,6],[24598,"Blighted super restore(4)",2000,1,2827,2881,20330,969562,0.16,5],[11959,"Black chinchompa",11000,1,3089,3089,63345,1638433,0.24,5],[536,"Dragon bones",7500,1,3128,3200,136028,5060769,0.17,4],[12408,"Piscatoris teleport",10000,1,3172,3487,1270,21894,0.45,5],[26368,"Nihil dust",11000,1,3214,3376,2834,63870,-1,100],[6689,"Saradomin brew(2)",2000,1,3328,4322,62,5747,-1,91],[12775,"Annakarl teleport (tablet)",10000,1,3393,3994,714,73855,6.59,7],[11240,"Young impling jar",18000,1,3513,3828,229,59332,-1,39],[11242,"Gourmet impling jar",18000,1,3736,3899,11253,244665,0.73,12],[31435,"Ironwood plank",13000,1,3790,3995,962,236530,1.81,12],[19619,"Salve graveyard teleport (tablet)",10000,1,3798,4143,667,29432,9.5,6],[12625,"Stamina potion(4)",2000,1,3851,3859,11987,582034,0.31,5],[11250,"Nature impling jar",18000,1,4001,4332,3101,30920,4.01,15],[10476,"Purple sweets",10000,1,5173,5270,10866,624840,1.13,30],[207,"Grimy ranarr weed",11000,1,5803,5819,25133,1109564,0.19,5],[30100,"Huasca potion (unf)",10000,1,6100,6450,80,42792,5.1,47],[6051,"Magic roots",11000,1,7052,7895,137,12016,3.92,86],[6685,"Saradomin brew(4)",2000,1,7055,7150,53342,1621967,0.06,4],[3051,"Grimy snapdragon",11000,1,7301,7304,17671,645629,0.62,5],[12907,"Anti-venom(3)",2000,1,8076,11888,36,3504,-1,48],[25419,"Urium remains",7500,1,8112,8445,4163,95183,0.67,14],[9245,"Onyx bolts (e)",11000,1,8476,8488,24115,971758,0.14,6],[1397,"Air battlestaff",18000,1,8795,8795,96109,1358277,0.38,5],[2434,"Prayer potion(4)",2000,1,9270,9270,65934,2148288,0.26,5],[3024,"Super restore(4)",2000,1,10001,10001,50280,1250858,0.01,5],[451,"Runite ore",4500,0,10201,10240,58069,2815870,0.22,5],[1683,"Dragonstone amulet (u)",10000,1,10530,11275,22,27802,-1,5],[1702,"Dragonstone amulet",10000,1,11041,11835,584,44388,2.77,8],[11968,"Skills necklace(6)",10000,1,11825,12294,323,30402,1.7,7],[12695,"Super combat potion(4)",2000,1,12060,12293,19297,791723,0.7,5],[2363,"Runite bar",10000,0,12215,12222,42774,2963493,0.04,4],[1631,"Uncut dragonstone",10000,1,14713,14847,5609,174793,1.13,20],[1333,"Rune scimitar",70,0,15181,15245,1158,70080,1.51,5],[5304,"Torstol seed",200,1,16330,16894,3445,85189,3.17,9],[28931,"Searing page",11000,1,18457,18999,6368,138433,0.36,9],[23685,"Divine super combat potion(4)",2000,1,18700,18750,32382,424649,0.88,7],[30134,"Prayer regeneration potion(1)",2000,1,20182,21969,308,4855,4.21,25],[5295,"Ranarr seed",200,1,30565,31327,6432,254903,1.44,4],[1127,"Rune platebody",70,0,38276,38281,3879,198053,0.84,4],[5300,"Snapdragon seed",200,1,45271,46343,4600,165207,1.88,5],[29993,"Aldarium",13000,1,58426,60000,4186,170733,0.57,5],[21804,"Ancient crystal",250,1,148900,154250,38,2187,0.01,8],[6528,"Tzhaar-ket-om",70,1,150824,158345,63,2042,-1,15],[22866,"Dragonfruit sapling",200,1,157212,164049,179,12509,0.58,12],[25404,"Bloodbark body",70,1,216944,225947,167,3559,0.25,8],[22951,"Boots of Brimstone",70,1,239785,249999,46,1829,3.22,10],[24187,"Trouver parchment",500,1,260864,268731,184,2918,0.29,10],[12004,"Kraken tentacle",70,1,282920,293014,75,2398,0.21,6],[12002,"Occult necklace",8,1,340000,361538,140,4635,2.63,6],[11256,"Dragon impling jar",18000,1,440281,458207,593,5165,-1,20],[6568,"Obsidian cape",70,1,474500,490000,34,1634,0.63,8],[32038,"Large dragon keel parts",100,1,500000,520000,17,1597,2.54,103],[11920,"Dragon pickaxe",40,1,587204,606590,115,2634,0.61,5],[21902,"Dragon crossbow",70,1,652892,669256,254,5387,0.35,5],[4151,"Abyssal whip",70,1,773322,785634,249,6885,0.01,6],[8788,"Magic stone",11000,1,978735,1001000,139,3461,0.16,20],[20716,"Tome of Fire (empty)",15,1,1580551,1630990,71,2358,0.55,7],[6573,"Onyx",11000,1,2752094,2839995,1,281,-1,61],[6585,"Amulet of fury",8,1,2760575,2845090,186,4888,0.83,13],[6737,"Berserker ring",8,1,3710832,3815338,123,4117,1.05,8],[25975,"Lightbearer",8,1,3916368,4025822,83,2474,1.61,5],[13235,"Eternal boots",15,1,3999952,4098359,41,1347,0.09,7],[21079,"Arcane prayer scroll",5,1,5416854,5480554,16,564,0.52,9],[11802,"Armadyl godsword",8,1,6859927,7024842,61,1893,0.06,6],[24777,"Blood shard",8,1,7248349,7427129,96,1902,1.01,14],[12924,"Toxic blowpipe (empty)",8,1,9741680,10000000,99,2262,0.82,5],[22327,"Justiciar chestguard",8,1,10234961,10497649,15,384,1.22,8],[13190,"Old school bond",100,0,11444444,11853014,577,0,3.2,5],[13576,"Dragon warhammer",8,1,15844512,16206521,69,1724,0.27,6],[19529,"Zenyte shard",11000,1,16206010,16278764,26,362,0.06,25],[26219,"Osmumten's fang",8,1,16579005,16965000,78,2552,0.2,5],[11804,"Bandos godsword",8,1,17302211,17681176,93,1627,0.62,6],[22481,"Sanguinesti staff (uncharged)",8,1,17600000,17728739,36,1057,-1,5],[13239,"Primordial boots",15,1,18295195,18738192,73,1655,0.52,7],[19550,"Ring of suffering",8,1,18648968,19246555,43,861,0.36,10],[19547,"Necklace of anguish",8,1,19023508,19459682,91,1962,0.41,7],[19544,"Tormented bracelet",8,1,19114249,19213088,65,1226,0.47,12],[19553,"Amulet of torture",8,1,19236429,19236429,69,1698,0.18,5],[21034,"Dexterous prayer scroll",5,1,19919158,19919158,25,671,-1,21],[11832,"Bandos chestplate",8,1,22534724,23046877,84,2039,0.44,8],[22324,"Ghrazi rapier",8,1,23121054,23663843,30,916,1.05,14],[13237,"Pegasian boots",15,1,34124988,34918203,28,1019,0.46,6],[27690,"Voidwaker",70,1,37483000,37567941,62,1976,0.42,8],[13652,"Dragon claws",8,1,37858591,38280810,52,1271,0.81,6],[22978,"Dragon hunter lance",8,1,46493723,47650998,53,1355,0.5,6],[21021,"Ancestral robe top",8,1,97799999,99800000,19,376,1.06,32],[12817,"Elysian spirit shield",8,1,493840267,499691152,1,177,-1,26],[27277,"Tumeken's shadow (uncharged)",8,1,788600000,794684777,23,431,0.33,38],[20997,"Twisted bow",8,1,1395000000,1397400000,21,373,-1,27]]};

const API = "https://prices.runescape.wiki/api/v1/osrs";
const SNAP_DATE = new Date(SNAPSHOT.ts * 1000);

/* ================= GE mechanics ================= */
// 2% tax on the sale price of each item, rounded down, capped at 5m/item.
// Items that sell below 50 gp are exempt — the classic penny-flipper edge.
// Old School Bonds (13190) are exempt outright.
const TAX_EXEMPT_IDS = new Set([13190]);
const geTax = (sell, id) => (sell < 50 || TAX_EXEMPT_IDS.has(id) ? 0 : Math.min(Math.floor(sell * 0.02), 5_000_000));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ================= formatting ================= */
const fmtGp = (n) => {
  if (n == null || isNaN(n)) return "–";
  const neg = n < 0 ? "-" : "";
  const x = Math.abs(n);
  if (x >= 1e9) return neg + (x / 1e9).toFixed(x >= 1e10 ? 1 : 2) + "b";
  if (x >= 1e6) return neg + (x / 1e6).toFixed(x >= 1e7 ? 1 : 2) + "m";
  if (x >= 10000) return neg + (x / 1000).toFixed(1) + "k";
  return neg + Math.round(x).toLocaleString();
};
const fmtFull = (n) => (n == null ? "–" : Math.round(n).toLocaleString() + " gp");
const fmtQty = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "m";
  if (n >= 10000) return (n / 1000).toFixed(0) + "k";
  return Math.round(n).toLocaleString();
};
const agoStr = (min) => {
  if (min < 1) return "<1m ago";
  if (min < 60) return Math.round(min) + "m ago";
  if (min < 1440) return (min / 60).toFixed(1) + "h ago";
  return (min / 1440).toFixed(1) + "d ago";
};
// duration in hours -> compact human string
const fmtDur = (h) => {
  if (h == null || !isFinite(h)) return "∞";
  const m = h * 60;
  if (m < 1) return "<1m";
  if (m < 60) return Math.round(m) + "m";
  if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + "h";
  return Math.round(h / 24) + "d";
};
// colour a fill-time: fast fills green, slow fills red
const durClass = (h) => (!isFinite(h) ? "dn" : h <= 0.25 ? "up" : h <= 2 ? "" : h <= 8 ? "wn" : "dn");

/* ================= data shaping ================= */
const rowToItem = (r) => ({
  id: r[0], name: r[1], limit: r[2], members: !!r[3],
  low: r[4], high: r[5], hv: r[6], dv: r[7],
  // snapshot stores combined hourly flow; assume an even split until live data lands
  hvLo: r[6] / 2, hvHi: r[6] / 2, hvSplit: false,
  avgLo: null, avgHi: null, momLo: null, momHi: null, unconf: false,
  vol: r[8] < 0 ? null : r[8], stale: r[9],
});
const BASE_ITEMS = SNAPSHOT.items.map(rowToItem);

/* ================= the model =================
   risk 0–100 from three observable pressures:
   - fill risk: thin hourly flow → your offers sit unfilled
   - drift risk: recent 5-min vs 1-hour price drift vs. your margin
   - staleness: minutes since either side of the book last traded    */
/* drift pressure vs the margin that cushions it.
   penny items tick in whole gp, so % drift is noise — damp it */
function driftOf(it, roi) {
  let v = it.vol == null ? 0.6 : it.vol;
  if (it.high < 50) v = Math.min(v, 8);
  return clamp((v / Math.max(Math.abs(roi), 0.15)) * 35, 0, 100);
}

function assess(it) {
  const tax = geTax(it.high, it.id);
  const margin = it.high - it.low - tax;
  const roi = it.low > 0 ? (margin / it.low) * 100 : 0;
  const spread = it.low > 0 ? ((it.high - it.low) / it.low) * 100 : 0;

  // the thinner side of the book gates your round trip — a one-sided tape still strands you
  const gateFlow = it.hvSplit ? Math.min(it.hvLo, it.hvHi) * 2 : (it.hv || 0);
  const fillR = clamp(100 - Math.log10(gateFlow + 1) * 20, 0, 100);
  const driftR = driftOf(it, roi);
  const staleR = clamp((it.stale || 0) * 1.5, 0, 100);
  const risk = Math.round(0.45 * fillR + 0.35 * driftR + 0.2 * staleR);

  return { ...it, tax, margin, roi, spread, fillR, driftR, staleR, risk };
}

/* ---- offer pricing & fill-time model ----
   The GE queue is price-time priority. At the touch (buy at insta-sell, sell at
   insta-buy) you sit behind everyone already quoted there — assume you capture
   ~25% of the counter-flow. Stepping even 1 gp inside the spread jumps the whole
   queue at that price, so capture leaps; deeper steps only outbid other steppers.
   Your buy order fills from insta-sellers (hvLo), your sell from insta-buyers (hvHi). */
const SHARE_TOUCH = 0.25;
// stepping 1 gp inside jumps the touch queue (price priority is real mechanics),
// but rivals reprice too — capture caps near 2.4x touch, not at "most of the flow"
const shareOf = (step, maxStep) =>
  step <= 0 ? SHARE_TOUCH : 0.5 + 0.1 * (maxStep > 0 ? step / maxStep : 1);

/* one pricing scenario for an item: step gp inside the spread on each side.
   fixedQty pins the stack size (strategy comparison); otherwise the stack is
   sized to round-trip inside the attention window tolH. shareMul brackets the
   capture guess (0.5 pessimistic … 1.5 optimistic) for range displays. */
function priceOut(a, budget, tolH, step, fixedQty, shareMul = 1) {
  const maxStep = Math.max(0, Math.floor((a.high - a.low - 1) / 2));
  step = clamp(step, 0, maxStep);
  const buyP = a.low + step;
  const sellP = a.high - step;
  const tax = geTax(sellP, a.id);
  const quotedMargin = sellP - buyP - tax;
  // confirmed margin: don't assume you sell above the hour's average high or
  // buy below its average low — the conservative figure is what gets ranked.
  // crossed hourly averages (a trending tape) clamp the margin to nothing,
  // which is the honest read: the hour's book paid no spread at all.
  let margin = quotedMargin;
  if (a.avgHi && a.avgLo) {
    const cSell = Math.min(sellP, a.avgHi);
    const cBuy = Math.max(buyP, a.avgLo);
    margin = Math.min(quotedMargin, cSell - cBuy - geTax(cSell, a.id));
  }
  const roi = buyP > 0 ? (margin / buyP) * 100 : 0;

  const share = clamp(shareOf(step, maxStep) * shareMul, 0.05, 0.95);
  const buyRate = a.hvLo * share;   // units/hour your buy offer absorbs
  const sellRate = a.hvHi * share;
  const afford = buyP > 0 ? Math.floor(budget / buyP) : 0;

  // biggest stack that still round-trips inside your attention window —
  // no floor: if even 1 unit can't cycle in time, the trade fails the window
  const hPerUnit = (buyRate > 0 ? 1 / buyRate : Infinity) + (sellRate > 0 ? 1 / sellRate : Infinity);
  const qtyTol = isFinite(hPerUnit) ? Math.floor(tolH / hPerUnit) : 0;
  const qty = fixedQty != null
    ? Math.max(0, Math.min(fixedQty, a.limit, afford))
    : Math.max(0, Math.min(a.limit, afford, qtyTol));

  const tBuyH = buyRate > 0 ? Math.max(qty / buyRate, 1 / 60) : Infinity;
  const tSellH = sellRate > 0 ? Math.max(qty / sellRate, 1 / 60) : Infinity;
  const cycleH = tBuyH + tSellH;
  const perCycle = qty * margin;
  // buy limit gates you to `limit` units per 4h no matter how fast you churn
  const gpHr = qty > 0 && isFinite(cycleH)
    ? (margin >= 0 ? Math.min(perCycle / cycleH, (a.limit * margin) / 4) : perCycle / cycleH)
    : 0;
  const capital = qty * buyP;
  return {
    step, maxStep, buyP, sellP, tax, margin, quotedMargin, roi, share,
    tBuyH, tSellH, cycleH, qty, perCycle, gpHr, capital, afford,
    limitBound: qty === a.limit && qty < Math.min(afford, qtyTol),
  };
}

/* play = 0 patient 4-hour limits … 1 five-minute scalper
   price = tiebreak lean: 0 favour full margin … 1 favour fast fills.
   The desk prices each item itself — it evaluates the discrete quotes worth
   considering (touch, +1 gp inside, mid-spread) and ranks the item on the best
   earner; the dial only breaks near-ties (within 10% of the best gp/hr). */
function playOut(a, budget, play, price) {
  const tolH = lerp(4, 0.25, play); // round-trip you'll tolerate
  const maxStep = Math.max(0, Math.floor((a.high - a.low - 1) / 2));
  const cands = [...new Set([0, Math.min(1, maxStep), Math.round(maxStep / 2)])];
  let p = null;
  for (const s of cands) {
    const r = priceOut(a, budget, tolH, s);
    if (!p) { p = r; continue; }
    const best = Math.max(p.gpHr, r.gpHr);
    if (best > 0 && Math.min(p.gpHr, r.gpHr) >= best * 0.9) {
      p = price < 0.5 ? (r.step < p.step ? r : p) : (r.step > p.step ? r : p);
    } else if (r.gpHr > p.gpHr) {
      p = r;
    }
  }
  // honest ranges: bracket the capture guess around the chosen quote
  const pess = priceOut(a, budget, tolH, p.step, p.qty, 0.5);
  const opt = priceOut(a, budget, tolH, p.step, p.qty, 1.5);
  // drift is scored against the margin actually ranked (stepped, confirmed),
  // and hurts in proportion to how long the round trip actually runs
  const driftH = clamp(driftOf(a, p.roi) * Math.sqrt(clamp(isFinite(p.cycleH) ? p.cycleH : 8, 0.1, 8)), 0, 100);
  const risk = Math.round(0.45 * a.fillR + 0.35 * driftH + 0.2 * a.staleR);
  const rocHr = p.capital > 0 ? (p.gpHr / p.capital) * 100 : 0;
  // a spread already ground down to the tax is being fought over by flippers
  // (meaningless for tax-exempt books, whose 1-2 gp spreads are their nature)
  const contested = a.hv > 0 && geTax(a.high, a.id) > 0 && a.high - a.low <= geTax(a.high, a.id) + 2;
  return {
    ...a, ...p, tolH, driftR: driftH, risk, rocHr, contested,
    gpHrLo: pess.gpHr, gpHrHi: opt.gpHr,
    bookMargin: a.margin, bookRoi: a.roi,
  };
}

const riskBucket = (r) => (r < 30 ? "low" : r < 60 ? "medium" : "high");
const RISK_COLOR = { low: "#83CE70", medium: "#E0A43A", high: "#E26A5A" };

/* signed tape read for a row: mean of the legs that actually traded, damped for pennies */
const momOf = (it) => {
  if (it.high < 50) return null; // penny ticks make % moves pure noise
  const legs = [it.momLo, it.momHi].filter((x) => x != null);
  if (!legs.length) return null;
  const m = legs.reduce((s, x) => s + x, 0) / legs.length;
  return { m, dir: m <= -0.75 ? "dn" : m >= 0.75 ? "up" : "flat" };
};

/* ================= presets ================= */
const PRESETS = [
  {
    key: "penny", label: "Penny bulk · tax-free",
    blurb: "Sub-50 gp items dodge the 2% tax entirely. One tick of margin on iron arrows or nails, moved in the tens of thousands.",
    c: { budget: 200_000, play: 0.55, price: 0, riskTol: 45, minRoi: 10, taxFree: true, f2p: false },
  },
  {
    key: "scalp", label: "5-minute scalps",
    blurb: "Deep books that fill in minutes. You're paid for attention, not patience — reprice constantly, exit fast.",
    c: { budget: 5_000_000, play: 1, price: 0.8, riskTol: 75, minRoi: 0.8, taxFree: false, f2p: false },
  },
  {
    key: "limits", label: "Steady 4-hour limits",
    blurb: "Set offers, walk away, collect. Ranked by what a full buy limit is worth, not by churn speed.",
    c: { budget: 20_000_000, play: 0.08, price: 0, riskTol: 50, minRoi: 1, taxFree: false, f2p: false },
  },
  {
    key: "whale", label: "High roller",
    blurb: "Big-ticket gear where one flip pays like a boss drop — and one drift wipes a day. Thin books, wide nerves.",
    c: { budget: 600_000_000, play: 0.35, price: 0.3, riskTol: 90, minRoi: 0.4, taxFree: false, f2p: false },
  },
];

/* ================= styles ================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap');
.fd-root {
  --bark:#161009; --panel:#221A10; --panel2:#2B2214; --inset:#1B1409;
  --trim:#57452A; --trim-hi:#8A6F3D; --gold:#F0B437; --gold-dim:#C69A45;
  --parch:#EDE1C6; --mut:#A5937A; --green:#83CE70; --red:#E26A5A; --amber:#E0A43A;
  --mono:ui-monospace,'Cascadia Code','SF Mono',Menlo,Consolas,monospace;
  --disp:'Cinzel',Georgia,'Times New Roman',serif;
  background:var(--bark); color:var(--parch); min-height:100vh;
  font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;
  font-size:14px; line-height:1.45;
}
.fd-root *, .fd-root *::before, .fd-root *::after { box-sizing:border-box; }
.fd-wrap { max-width:1160px; margin:0 auto; padding:20px 16px 60px; }

/* masthead */
.fd-mast { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; padding-bottom:14px; }
.fd-title { font-family:var(--disp); font-weight:700; font-size:clamp(22px,4vw,34px); letter-spacing:.06em; color:var(--gold); margin:0; line-height:1.1; }
.fd-sub { font-family:var(--disp); font-weight:600; font-size:11px; letter-spacing:.34em; color:var(--mut); text-transform:uppercase; margin:2px 0 0; }
.fd-rule { height:3px; border:none; margin:0 0 16px;
  background:linear-gradient(90deg, transparent, var(--trim-hi) 8%, var(--gold) 50%, var(--trim-hi) 92%, transparent);
  background-size:200% 100%; animation:fd-shimmer 9s linear infinite; }
@keyframes fd-shimmer { from{background-position:0% 0} to{background-position:200% 0} }
@media (prefers-reduced-motion: reduce){ .fd-rule{animation:none} .fd-live-dot{animation:none} }

.fd-status { display:flex; align-items:center; gap:10px; }
.fd-chip { display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:11px; letter-spacing:.12em;
  padding:5px 11px; border:1px solid var(--trim); border-radius:3px; background:var(--inset); white-space:nowrap; }
.fd-chip.live { color:var(--green); border-color:#3E5A34; }
.fd-chip.snap { color:var(--amber); border-color:#6E5426; }
.fd-chip.load { color:var(--mut); }
.fd-live-dot { width:7px; height:7px; border-radius:50%; background:currentColor; animation:fd-pulse 2s ease-in-out infinite; }
@keyframes fd-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.fd-btn { font-family:var(--mono); font-size:11px; letter-spacing:.08em; color:var(--gold); background:var(--panel2);
  border:1px solid var(--trim-hi); border-radius:3px; padding:6px 12px; cursor:pointer; }
.fd-btn:hover { background:#332818; }
.fd-btn:disabled { opacity:.45; cursor:default; }
.fd-root button:focus-visible, .fd-root input:focus-visible, .fd-root a:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }

/* banner */
.fd-warn { border:1px solid #6E5426; background:linear-gradient(180deg,#33270F,#2A2010); color:#F1D08A;
  border-radius:4px; padding:11px 14px; margin-bottom:16px; font-size:13px; display:flex; gap:10px; align-items:flex-start; }
.fd-warn b { color:var(--gold); }
.fd-warn .sig { font-family:var(--disp); font-size:15px; line-height:1; padding-top:1px; }

/* market read */
.fd-read { font-style:italic; color:#CFC0A2; border-left:3px solid var(--trim-hi); padding:2px 0 2px 12px; margin:0 0 18px; font-size:13.5px; }
.fd-read b { color:var(--gold); font-style:normal; }

/* panels */
.fd-panel { background:var(--panel); border:1px solid var(--trim); border-radius:5px; padding:14px; margin-bottom:16px; position:relative; }
.fd-panel::before { content:""; position:absolute; inset:2px; border:1px solid rgba(138,111,61,.25); border-radius:3px; pointer-events:none; }
.fd-lab { font-family:var(--disp); font-weight:600; font-size:11px; letter-spacing:.3em; text-transform:uppercase; color:var(--gold-dim); margin:0 0 10px; }

/* presets */
.fd-presets { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
.fd-preset { border:1px solid var(--trim); background:var(--inset); color:var(--parch); border-radius:3px;
  padding:7px 12px; font-size:12.5px; cursor:pointer; }
.fd-preset:hover { border-color:var(--trim-hi); }
.fd-preset.on { border-color:var(--gold); color:var(--gold); background:#2E2410; }
.fd-blurb { font-size:12.5px; color:var(--mut); margin:-4px 0 12px; min-height:1em; }

/* controls grid */
.fd-controls { display:grid; grid-template-columns:repeat(3,1fr); gap:16px 22px; }
@media (max-width:860px){ .fd-controls{grid-template-columns:1fr 1fr} }
@media (max-width:560px){ .fd-controls{grid-template-columns:1fr} }
.fd-ctl label { display:flex; justify-content:space-between; align-items:baseline; font-size:12px; color:var(--mut); margin-bottom:6px; letter-spacing:.04em; }
.fd-ctl label b { font-family:var(--mono); color:var(--gold); font-size:13px; font-weight:600; }
.fd-ends { display:flex; justify-content:space-between; font-size:10.5px; color:#7A6B54; margin-top:3px; font-family:var(--mono); }
input.fd-range { -webkit-appearance:none; appearance:none; width:100%; height:22px; background:transparent; cursor:pointer; margin:0; }
input.fd-range::-webkit-slider-runnable-track { height:5px; border-radius:3px; background:linear-gradient(90deg,var(--trim-hi),var(--trim)); border:1px solid #3A2E1B; }
input.fd-range::-webkit-slider-thumb { -webkit-appearance:none; width:17px; height:17px; border-radius:50%; margin-top:-7px;
  background:radial-gradient(circle at 35% 30%, #FFE29A, var(--gold) 55%, #9C7420); border:1px solid #5C451A; box-shadow:0 1px 3px rgba(0,0,0,.6); }
input.fd-range::-moz-range-track { height:5px; border-radius:3px; background:var(--trim); }
input.fd-range::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:var(--gold); border:1px solid #5C451A; }
.fd-togs { display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
.fd-tog { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--parch); cursor:pointer; user-select:none; }
.fd-tog input { accent-color:#F0B437; width:15px; height:15px; }
.fd-search { background:var(--inset); border:1px solid var(--trim); color:var(--parch); border-radius:3px;
  padding:7px 10px; font-size:13px; width:100%; font-family:var(--mono); }
.fd-search::placeholder { color:#6E5F49; }

/* scoreboard */
.fd-score { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }
@media (max-width:760px){ .fd-score{grid-template-columns:1fr} }
.fd-card { background:linear-gradient(180deg,var(--panel2),var(--panel)); border:1px solid var(--trim); border-radius:5px; padding:12px 14px; cursor:pointer; text-align:left; color:var(--parch); }
.fd-card:hover { border-color:var(--trim-hi); }
.fd-card .k { font-size:10.5px; letter-spacing:.22em; text-transform:uppercase; color:var(--mut); font-family:var(--disp); font-weight:600; }
.fd-card .n { font-size:15px; color:var(--gold); margin:5px 0 2px; font-weight:600; }
.fd-card .v { font-family:var(--mono); font-size:13px; color:var(--parch); }
.fd-card .v span { color:var(--mut); }

/* charts */
.fd-charts { display:grid; grid-template-columns:3fr 2fr; gap:16px; }
@media (max-width:860px){ .fd-charts{grid-template-columns:1fr} }
.fd-tip { background:#241C0F; border:1px solid var(--trim-hi); border-radius:4px; padding:9px 11px; font-size:12px; font-family:var(--mono); color:var(--parch); }
.fd-tip b { color:var(--gold); display:block; margin-bottom:3px; font-size:12.5px; }

/* table */
.fd-tablewrap { overflow:auto; max-height:520px; border:1px solid var(--trim); border-radius:4px; background:var(--inset); }
table.fd-t { border-collapse:collapse; width:100%; font-size:12.5px; min-width:720px; }
.fd-t thead th { position:sticky; top:0; background:#2E2412; color:var(--gold-dim); font-family:var(--disp); font-weight:600;
  font-size:10px; letter-spacing:.18em; text-transform:uppercase; text-align:right; padding:9px 10px; border-bottom:1px solid var(--trim-hi); cursor:pointer; white-space:nowrap; z-index:2; }
.fd-t thead th:first-child { text-align:left; }
.fd-t thead th.on { color:var(--gold); }
.fd-t tbody td { padding:7px 10px; text-align:right; font-family:var(--mono); border-bottom:1px solid #2A2113; white-space:nowrap; }
.fd-t tbody td:first-child { text-align:left; font-family:inherit; }
.fd-t tbody tr { cursor:pointer; }
.fd-t tbody tr:hover { background:#241C0E; }
.fd-t tbody tr.sel { background:#2E2410; box-shadow:inset 3px 0 0 var(--gold); }
.fd-t .up { color:var(--green); } .fd-t .dn { color:var(--red); } .fd-t .mut { color:var(--mut); } .fd-t .wn { color:var(--amber); }
.fd-t .gold { color:var(--gold); }
.fd-t .dim { opacity:.45; }
.fd-caret { display:inline-block; width:14px; color:var(--gold-dim); font-size:10px; }
.fd-mom { margin-left:6px; font-size:10px; }
.fd-mom.up { color:var(--green); } .fd-mom.dn { color:var(--red); }
.fd-badge { display:inline-block; font-size:10px; letter-spacing:.08em; padding:2px 7px; border-radius:2px; border:1px solid; font-family:var(--mono); }
.fd-mem { color:#C9A0E8; font-size:10px; margin-left:6px; border:1px solid #5A4470; border-radius:2px; padding:0 4px; }
.fd-f2p { color:#8FBCE0; font-size:10px; margin-left:6px; border:1px solid #3E5A70; border-radius:2px; padding:0 4px; }
.fd-taxfree { color:var(--green); font-size:10px; margin-left:6px; border:1px solid #3E5A34; border-radius:2px; padding:0 4px; }
.fd-unconf { color:var(--amber); font-size:10px; margin-left:6px; border:1px dashed #6E5426; border-radius:2px; padding:0 4px; cursor:help; }
@media (max-width:700px){ .hide-sm{display:none} table.fd-t{min-width:560px} }

/* expanded row */
.fd-t tbody tr.fd-exprow, .fd-t tbody tr.fd-exprow:hover { background:#20180C; cursor:default; }
.fd-t tbody tr.fd-exprow > td { padding:0; white-space:normal; text-align:left; }
.fd-expand { padding:12px 14px 14px; border-top:1px solid var(--trim-hi); border-bottom:2px solid var(--trim-hi);
  box-shadow:inset 3px 0 0 var(--gold); display:flex; flex-direction:column; gap:12px; }
.fd-exphead { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.fd-exphead h3 { margin:0; font-family:var(--disp); font-size:17px; color:var(--gold); letter-spacing:.04em; }
.fd-expgrid { display:grid; grid-template-columns:1.1fr 1fr 1.2fr; gap:12px; }
@media (max-width:860px){ .fd-expgrid{grid-template-columns:1fr} }
.fd-stepnote { font-style:normal; font-size:10px; color:var(--mut); margin-left:5px; }
table.fd-strat { width:100%; border-collapse:collapse; font-family:var(--mono); font-size:12px; min-width:520px; }
.fd-t .fd-strat th { position:static; text-align:right; color:var(--gold-dim); font-family:var(--disp); font-weight:600;
  font-size:9.5px; letter-spacing:.14em; text-transform:uppercase; padding:4px 8px; border-bottom:1px solid var(--trim); cursor:default; background:none; }
.fd-t .fd-strat th:first-child, .fd-t .fd-strat td:first-child { text-align:left; }
.fd-t .fd-strat td { text-align:right; padding:5px 8px; border-bottom:1px solid #2A2113; white-space:nowrap; }
.fd-t tbody .fd-strat tr, .fd-t tbody .fd-strat tr:hover { cursor:default; background:transparent; }
.fd-t tbody .fd-strat tr.cur, .fd-t tbody .fd-strat tr.cur:hover { background:#2E2410; }
.fd-t .fd-strat tr.cur td:first-child { box-shadow:inset 2px 0 0 var(--gold); color:var(--gold); }
.fd-box { background:var(--inset); border:1px solid var(--trim); border-radius:4px; padding:11px 12px; }
.fd-box h4 { margin:0 0 8px; font-size:10.5px; letter-spacing:.24em; text-transform:uppercase; color:var(--gold-dim); font-family:var(--disp); font-weight:600; }
.fd-kv { display:flex; justify-content:space-between; font-family:var(--mono); font-size:12.5px; padding:3px 0; gap:10px; }
.fd-kv span { color:var(--mut); font-family:'Segoe UI',system-ui,sans-serif; }
.fd-kv b { font-weight:600; color:var(--parch); }
.fd-kv b.g { color:var(--green); } .fd-kv b.r { color:var(--red); } .fd-kv b.au { color:var(--gold); }
.fd-riskbar { height:7px; background:#151006; border:1px solid #3A2E1B; border-radius:3px; overflow:hidden; margin:3px 0 8px; }
.fd-riskbar i { display:block; height:100%; }
.fd-note { font-size:11.5px; color:var(--mut); margin-top:8px; line-height:1.5; }
.fd-note.fd-knife { color:#E8A79B; }
.fd-note.fd-rise { color:#B9DFA9; }
.fd-link { color:var(--gold); text-decoration:none; border-bottom:1px dotted var(--gold-dim); font-size:12px; }
.fd-tapestats { display:grid; grid-template-columns:repeat(3,1fr); gap:0 18px; margin-bottom:6px; }
@media (max-width:860px){ .fd-tapestats{grid-template-columns:1fr} }

/* desk plan */
.fd-planrows { display:flex; flex-direction:column; gap:6px; }
.fd-planrow { display:grid; grid-template-columns:26px 1.5fr 1.5fr 1fr .9fr 1.1fr; gap:10px; align-items:center;
  background:var(--inset); border:1px solid var(--trim); border-radius:4px; padding:8px 12px;
  color:var(--parch); font-family:var(--mono); font-size:12.5px; cursor:pointer; text-align:left; width:100%; }
.fd-planrow:hover { border-color:var(--trim-hi); background:#241C0E; }
.fd-planrow .slot { font-family:var(--disp); font-weight:700; color:var(--gold-dim); font-size:14px; }
.fd-planrow .nm { font-family:'Segoe UI',system-ui,sans-serif; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fd-planrow .qty, .fd-planrow .cap, .fd-planrow .cyc { color:var(--mut); }
.fd-planrow .cap, .fd-planrow .cyc, .fd-planrow .est { text-align:right; }
.fd-planrow .est { color:var(--gold); white-space:nowrap; }
@media (max-width:760px){ .fd-planrow{grid-template-columns:22px 1.2fr 1fr} .fd-planrow .cap,.fd-planrow .cyc,.fd-planrow .qty{display:none} }

/* flip ledger */
table.fd-lt { width:100%; border-collapse:collapse; font-family:var(--mono); font-size:12px; min-width:680px; }
.fd-lt th { text-align:right; color:var(--gold-dim); font-family:var(--disp); font-weight:600; font-size:9.5px;
  letter-spacing:.14em; text-transform:uppercase; padding:4px 8px; border-bottom:1px solid var(--trim); white-space:nowrap; }
.fd-lt th:first-child, .fd-lt td:first-child { text-align:left; }
.fd-lt td { text-align:right; padding:5px 8px; border-bottom:1px solid #2A2113; white-space:nowrap; }
.fd-lt .up { color:var(--green); } .fd-lt .dn { color:var(--red); } .fd-lt .mut { color:var(--mut); }
.fd-lt tr.closedRow td { opacity:.55; }
.fd-linkbtn { background:none; border:none; color:var(--gold); cursor:pointer; font:inherit; padding:0; border-bottom:1px dotted var(--gold-dim); }
.fd-in { background:var(--inset); border:1px solid var(--trim); color:var(--parch); border-radius:3px; padding:3px 6px; width:110px; font-family:var(--mono); font-size:12px; }
.fd-calrow { display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-top:10px; font-size:12.5px; color:var(--mut); }

/* ledger notes */
.fd-notes { columns:2; column-gap:28px; font-size:12.5px; color:#C4B594; }
@media (max-width:760px){ .fd-notes{columns:1} }
.fd-notes p { margin:0 0 10px; break-inside:avoid; }
.fd-notes b { color:var(--gold-dim); }
.fd-foot { text-align:center; color:#7A6B54; font-size:11px; margin-top:20px; font-family:var(--mono); letter-spacing:.06em; }
`;

/* ================= api citizenship =================
   The wiki's price API is a free community service run for RuneLite users.
   This desk is deliberately polite with it:
   - every endpoint is cached at its natural update cadence (latest ~1min,
     5m blocks every 5min, 1h refreshed 15min, volumes hourly, mapping ~weekly)
   - concurrent callers share a single in-flight request
   - errors back off exponentially PER ENDPOINT, serving stale data meanwhile
     (a dead /mapping escalates its own backoff without pausing /latest)
   - a hidden tab never polls; the refresh button can't bust the cache      */
const TTL = {
  latest: 85_000, "5m": 300_000, "1h": 900_000,
  volumes: 3_600_000, timeseries: 600_000, mapping: 7 * 86_400_000,
};
const memCache = new Map();   // url -> {ts, data}
const inflight = new Map();   // url -> Promise
const cooloff = new Map();    // kind -> {streak, until}

async function apiGet(kind, url) {
  const ttl = TTL[kind] ?? 300_000;
  const hit = memCache.get(url);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  const cool = cooloff.get(kind);
  if (cool && Date.now() < cool.until) {
    if (hit) return hit.data;               // stale beats hammering a hurting API
    throw new Error("cooling off");
  }
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      cooloff.delete(kind);
      memCache.set(url, { ts: Date.now(), data });
      return data;
    } catch (e) {
      const streak = (cooloff.get(kind)?.streak || 0) + 1;
      cooloff.set(kind, { streak, until: Date.now() + Math.min(45_000 * 2 ** (streak - 1), 900_000) });
      if (hit) return hit.data;
      throw e;
    } finally { clearTimeout(t); inflight.delete(url); }
  })();
  inflight.set(url, p);
  return p;
}

/* the full tradeable universe from /mapping, slimmed and cached ~weekly */
async function loadUniverse() {
  const LS = "fd:universe-v1";
  try {
    const j = JSON.parse(localStorage.getItem(LS));
    if (j && Date.now() - j.ts < TTL.mapping && j.items?.length > 500) return j.items;
  } catch (e) { /* no storage / stale — refetch */ }
  try {
    const map = await apiGet("mapping", `${API}/mapping`);
    if (!Array.isArray(map) || map.length < 500) return null;
    const items = map
      .filter((m) => m.id != null && m.name && m.limit > 0)
      .map((m) => ({ id: m.id, name: m.name, limit: m.limit, members: !!m.members }));
    try { localStorage.setItem(LS, JSON.stringify({ ts: Date.now(), items })); } catch (e) {}
    return items;
  } catch (e) { return null; }
}

async function pullLive() {
  const [latest, h1, vols, uni] = await Promise.all([
    apiGet("latest", `${API}/latest`),
    apiGet("1h", `${API}/1h`),
    apiGet("volumes", `${API}/volumes`),
    loadUniverse(),
  ]);
  let m5 = null;
  try { m5 = await apiGet("5m", `${API}/5m`); } catch (e) { /* drift & momentum fall back */ }
  const meta = uni || BASE_ITEMS;      // no mapping? fall back to the desk classics
  const now = Math.floor(Date.now() / 1000);
  const items = [];
  for (const base of meta) {
    const p = latest.data?.[base.id];
    if (!p || !p.high || !p.low) continue;
    const high = p.high, low = p.low;
    // crossed tape (insta-buy below insta-sell) means one side is stale and the
    // price is moving — swapping would fabricate a margin out of staleness
    if (high < low) continue;
    const h = h1.data?.[base.id] || {};
    const f = m5?.data?.[base.id] || {};
    // highPriceVolume = trades at insta-buy (fills YOUR sell offer); lowPriceVolume = insta-sells (fills YOUR buy offer)
    const hvHi = h.highPriceVolume || 0;
    const hvLo = h.lowPriceVolume || 0;
    const hv = hvHi + hvLo;
    const mid = (d) => (d.avgHighPrice && d.avgLowPrice ? (d.avgHighPrice + d.avgLowPrice) / 2 : d.avgHighPrice || d.avgLowPrice || null);
    const m1 = mid(h), mf = mid(f);
    const vol = m1 && mf ? Math.abs(mf - m1) / m1 * 100 : null;
    // signed per-leg momentum: 5m average vs the hour's, % — the sign is the story
    const momLo = h.avgLowPrice && f.avgLowPrice ? ((f.avgLowPrice - h.avgLowPrice) / h.avgLowPrice) * 100 : null;
    const momHi = h.avgHighPrice && f.avgHighPrice ? ((f.avgHighPrice - h.avgHighPrice) / h.avgHighPrice) * 100 : null;
    const stale = Math.max(now - (p.highTime || now), now - (p.lowTime || now)) / 60;
    // a latest spread far wider than the hour's average is usually one bait or
    // outlier print, not a margin you can capture — badge it, don't chase it.
    // missing or crossed hourly averages (thin or trending tape) are just as
    // unconfirmable, so they carry the badge too
    const avgSpread = h.avgHighPrice && h.avgLowPrice ? h.avgHighPrice - h.avgLowPrice : null;
    const unconf = avgSpread == null || avgSpread <= 0 || high - low > Math.max(1.5 * avgSpread, avgSpread + 2);
    items.push({
      id: base.id, name: base.name, limit: base.limit, members: base.members,
      low, high, hv, hvHi, hvLo, hvSplit: true, unconf,
      avgLo: h.avgLowPrice || null, avgHi: h.avgHighPrice || null,
      momLo, momHi,
      dv: vols.data?.[base.id] ?? 0,
      vol, stale: Math.round(stale),
    });
  }
  if (items.length < 20) throw new Error("thin response");
  return { items, universe: !!uni };
}

/* ================= small pieces ================= */
const RiskBadge = ({ risk }) => {
  const b = riskBucket(risk);
  return (
    <span className="fd-badge" style={{ color: RISK_COLOR[b], borderColor: RISK_COLOR[b] + "66" }}>
      {b.toUpperCase()} {risk}
    </span>
  );
};

const ScatterTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="fd-tip">
      <b>{d.name}</b>
      buy {fmtGp(d.low)} → sell {fmtGp(d.high)}<br />
      net {fmtGp(d.margin)} · ROI {d.roi.toFixed(1)}%<br />
      24h vol {fmtQty(d.dv)} · risk {d.risk}
    </div>
  );
};

const BarTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="fd-tip">
      <b>{d.name}</b>
      est. {fmtGp(d.gpHr)}/hr · {fmtQty(d.qty)} units per cycle<br />
      capital {fmtGp(d.capital)} · ~{fmtDur(d.cycleH)} per cycle
    </div>
  );
};

/* ================= app ================= */
export default function FlipDesk() {
  const [status, setStatus] = useState("loading"); // loading | live | snapshot
  const [live, setLive] = useState(null);          // {items, universe} | null
  const [updatedAt, setUpdatedAt] = useState(null);
  const [preset, setPreset] = useState("penny");
  const [ctl, setCtl] = useState({ ...PRESETS[0].c });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("gpHr");
  const [sortDir, setSortDir] = useState(-1);
  const [selId, setSelId] = useState(null);
  const [series, setSeries] = useState({}); // id -> {ts, pts}|{ts, err}
  const [ledger, setLedger] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fd-ledger-v1")) || []; } catch (e) { return []; }
  });
  const [calOn, setCalOn] = useState(() => {
    try { return localStorage.getItem("fd-cal") === "1"; } catch (e) { return false; }
  });
  const [, setTick] = useState(0); // periodic re-render so the data-age chip ticks

  const refresh = useCallback(async (auto = false) => {
    if (!auto) setStatus("loading");
    try {
      const r = await pullLive();
      setLive(r);
      setUpdatedAt(new Date());
      setStatus("live");
    } catch (e) {
      // an auto tick that fails keeps showing the last good tape; the age chip tells the story
      setStatus((s) => (auto && s === "live" ? s : "snapshot"));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /* polite auto-poll: 90s cadence, only while the tab is visible; apiGet's
     per-endpoint caches mean each tick costs at most one /latest request */
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) refresh(true); }, 90_000);
    const onVis = () => { if (!document.hidden) refresh(true); };
    document.addEventListener("visibilitychange", onVis);
    const age = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => { clearInterval(iv); clearInterval(age); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  useEffect(() => { try { localStorage.setItem("fd-ledger-v1", JSON.stringify(ledger)); } catch (e) {} }, [ledger]);
  useEffect(() => { try { localStorage.setItem("fd-cal", calOn ? "1" : "0"); } catch (e) {} }, [calOn]);

  const setC = (patch) => { setCtl((c) => ({ ...c, ...patch })); setPreset(null); };
  const applyPreset = (p) => {
    setCtl({ ...p.c });
    setPreset(p.key);
    setSortKey(p.key === "limits" ? "perCycle" : "gpHr");
    setSortDir(-1);
  };

  /* the working set: the full live universe, or the baked classics offline */
  const assessed = useMemo(() => (live?.items ?? BASE_ITEMS).map(assess), [live]);

  const played = useMemo(
    () => assessed.map((a) => playOut(a, ctl.budget, ctl.play, ctl.price)),
    [assessed, ctl.budget, ctl.play, ctl.price]
  );

  /* personal calibration: gp-weighted realized ÷ predicted over closed flips.
     Losses count in full — the one number that must never flatter. */
  const calibration = useMemo(() => {
    const closed = ledger.filter((l) => l.status === "closed" && l.predNet > 0 && l.realNet != null);
    if (closed.length < 2) return null;
    const pred = closed.reduce((s, l) => s + l.predNet, 0);
    const real = closed.reduce((s, l) => s + l.realNet, 0);
    return pred > 0 ? real / pred : null;
  }, [ledger]);
  const calF = calOn && calibration != null ? clamp(calibration, 0.1, 1.5) : 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = played.filter((p) =>
      p.qty > 0 &&
      p.roi >= ctl.minRoi &&
      p.risk <= ctl.riskTol &&
      (!ctl.taxFree || p.high < 50) &&
      (!ctl.f2p || !p.members) &&
      (!q || p.name.toLowerCase().includes(q))
    );
    // calibration scales every rate-derived column together so they stay in agreement
    return calF === 1 ? out : out.map((p) => ({
      ...p, gpHr: p.gpHr * calF, gpHrLo: p.gpHrLo * calF, gpHrHi: p.gpHrHi * calF,
      perCycle: p.perCycle * calF, rocHr: p.rocHr * calF,
    }));
  }, [played, ctl, search, calF]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === "name" ? a.name : a[sortKey];
      const vb = sortKey === "name" ? b.name : b[sortKey];
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const best = useMemo(() => {
    if (!filtered.length) return null;
    const byHr = [...filtered].sort((a, b) => b.gpHr - a.gpHr);
    const byRoi = [...filtered].sort((a, b) => b.roi - a.roi);
    const safe = [...filtered].filter((x) => x.gpHr > 0).sort((a, b) => a.risk - b.risk || b.gpHr - a.gpHr);
    return { hr: byHr[0], roi: byRoi[0], safe: safe[0] || byHr[0] };
  }, [filtered]);

  const read = useMemo(() => {
    const n = filtered.length;
    if (!n) return null;
    const penny = filtered.filter((x) => x.high < 50);
    const pennyFlow = penny.reduce((s, x) => s + x.dv, 0);
    return { n, total: played.length, penny: penny.length, pennyFlow, top: best?.hr };
  }, [filtered, played, best]);

  const sel = useMemo(() => played.find((p) => p.id === selId) || null, [played, selId]);

  /* 24h tape for the selected item — one request per item per 10 minutes, tops.
     The 350ms debounce means surfing down the board coalesces to the row the
     user actually lands on instead of firing a request per keystroke of clicks. */
  useEffect(() => {
    if (!sel) return;
    const e = series[sel.id];
    if (e && Date.now() - e.ts < TTL.timeseries) return;
    let dead = false;
    const t = setTimeout(() => {
      apiGet("timeseries", `${API}/timeseries?timestep=5m&id=${sel.id}`)
        .then((j) => {
          if (dead) return;
          const raw = (j.data || []).slice(-288);
          const pts = raw.map((d) => ({
            t: d.timestamp, hi: d.avgHighPrice, lo: d.avgLowPrice,
            v: (d.highPriceVolume || 0) + (d.lowPriceVolume || 0),
          })).filter((d) => d.hi || d.lo);
          setSeries((s) => ({ ...s, [sel.id]: pts.length ? { ts: Date.now(), pts, n: raw.length } : { ts: Date.now(), err: true } }));
        })
        .catch(() => { if (!dead) setSeries((s) => ({ ...s, [sel.id]: { ts: Date.now(), err: true } })); });
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [sel, series]);

  /* Desk Plan: greedy allocation of the bankroll across GE slots by est. gp/hr */
  const plan = useMemo(() => {
    const slots = ctl.f2p ? 3 : 8; // a free-to-play account has 3 GE slots
    let bank = ctl.budget;
    const lines = [];
    for (const c of [...filtered].sort((a, b) => b.gpHr - a.gpHr)) {
      if (lines.length >= slots || bank <= 0) break;
      if (c.gpHr <= 0 || c.buyP > bank) continue;
      // a plan is a portfolio: no single line hogs more than ~40% of the bankroll
      // (unless one unit already costs more than that)
      const lineBank = Math.min(bank, Math.max(ctl.budget * 0.4, c.buyP));
      const r = priceOut(c, lineBank, c.tolH, c.step); // re-sized to the coin left
      if (r.qty < 1 || r.perCycle <= 0) continue;
      const pess = priceOut(c, bank, c.tolH, c.step, r.qty, 0.5);
      const opt = priceOut(c, bank, c.tolH, c.step, r.qty, 1.5);
      lines.push({
        id: c.id, name: c.name, risk: c.risk, qty: r.qty, buyP: r.buyP, sellP: r.sellP,
        capital: r.capital, cycleH: r.cycleH,
        gpHr: r.gpHr * calF, gpHrLo: pess.gpHr * calF, gpHrHi: opt.gpHr * calF,
      });
      bank -= r.capital;
    }
    return {
      lines, slots, deployed: ctl.budget - bank,
      estLo: lines.reduce((s, l) => s + l.gpHrLo, 0),
      estHi: lines.reduce((s, l) => s + l.gpHrHi, 0),
    };
  }, [filtered, ctl.budget, ctl.f2p, calF]);

  const byId = useMemo(() => new Map(played.map((p) => [p.id, p])), [played]);

  const logFlip = useCallback((p) => {
    // store RAW predictions (never calibrated), or the loop would feed on itself
    const raw = byId.get(p.id) || p;
    setLedger((L) => [...L, {
      uid: Date.now() + ":" + p.id, id: raw.id, name: raw.name, qty: raw.qty,
      buyP: raw.buyP, sellP: raw.sellP, predNet: raw.perCycle, predGpHr: Math.round(raw.gpHr),
      predCycleH: isFinite(raw.cycleH) ? +raw.cycleH.toFixed(2) : null,
      ts: Date.now(), status: "open", realNet: null,
    }]);
  }, [byId]);

  const clickSort = (k, dir = -1) => {
    if (sortKey === k) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(dir); }
  };

  const budgetSlider = Math.log10(ctl.budget);
  const playLabel = ctl.play < 0.25 ? "patient — 4h limit cycles"
    : ctl.play < 0.6 ? "mixed — check in hourly"
    : ctl.play < 0.85 ? "active — reprice often"
    : "scalping — 5-min churn";
  const priceLabel = ctl.price < 0.35 ? "lean margin on close calls"
    : ctl.price < 0.65 ? "let the numbers decide"
    : "lean speed on close calls";
  const riskLabel = ctl.riskTol < 40 ? "careful" : ctl.riskTol < 70 ? "balanced" : "degen";
  const activePreset = PRESETS.find((p) => p.key === preset);

  const scatterData = [...filtered].sort((a, b) => b.gpHr - a.gpHr).slice(0, 400)
    .map((f) => ({ ...f, dvLog: Math.max(f.dv, 1), roiCap: Math.min(f.roi, 80) }));
  const topBars = [...filtered].sort((a, b) => b.gpHr - a.gpHr).slice(0, 8)
    .map((x) => ({ ...x, shortName: x.name.length > 18 ? x.name.slice(0, 17) + "…" : x.name }));

  const snapAge = Math.round((Date.now() / 1000 - SNAPSHOT.ts) / 3600);

  return (
    <div className="fd-root">
      <style>{CSS}</style>
      <div className="fd-wrap">

        {/* masthead */}
        <header className="fd-mast">
          <div>
            <h1 className="fd-title">The Flip Desk</h1>
            <p className="fd-sub">Grand Exchange · Market Ledger</p>
          </div>
          <div className="fd-status">
            {status === "live" && (
              <span className="fd-chip live"><i className="fd-live-dot" />LIVE · {assessed.length.toLocaleString()} ITEMS · {updatedAt ? agoStr((Date.now() - updatedAt.getTime()) / 60000).replace(" ago", "").toUpperCase() : ""}</span>
            )}
            {status === "snapshot" && <span className="fd-chip snap">◈ SNAPSHOT · {SNAP_DATE.toLocaleDateString([], { day: "numeric", month: "short" })}</span>}
            {status === "loading" && <span className="fd-chip load">… polling exchange</span>}
            <button className="fd-btn" onClick={() => refresh(false)} disabled={status === "loading"}>↻ Refresh</button>
          </div>
        </header>
        <hr className="fd-rule" />

        {/* offline warning */}
        {status === "snapshot" && (
          <div className="fd-warn" role="alert">
            <span className="sig">⚠</span>
            <span>
              <b>Live feed unreachable.</b> Showing the baked snapshot from{" "}
              {SNAP_DATE.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {snapAge > 1 ? ` (~${snapAge}h old)` : ""}. Margins drift by the minute — treat these numbers as a
              teaching tape, not an order book, and hit Refresh when you're back online.
            </span>
          </div>
        )}

        {/* market read */}
        {read && (
          <p className="fd-read">
            {read.n} of {read.total.toLocaleString()} {status === "live" && live?.universe ? "scanned tradeables" : "tracked items"} pass your desk rules.
            {read.top && <> Best tape right now: <b>{read.top.name}</b> at ~<b>{fmtGp(read.top.gpHr)}/hr</b> on your settings.</>}
            {read.penny > 0 && <> {read.penny} tax-exempt penny items are moving ~{fmtQty(read.pennyFlow)} units a day between them.</>}
            {calF !== 1 && <> Estimates calibrated to your ledger (×{calF.toFixed(2)}).</>}
          </p>
        )}

        {/* controls */}
        <section className="fd-panel">
          <h2 className="fd-lab">Desk Rules</h2>
          <div className="fd-presets">
            {PRESETS.map((p) => (
              <button key={p.key} className={"fd-preset" + (preset === p.key ? " on" : "")} onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="fd-blurb">{activePreset ? activePreset.blurb : "Custom rules — tune the sliders to your own read of the market."}</p>

          <div className="fd-controls">
            <div className="fd-ctl">
              <label>Bankroll <b>{fmtGp(ctl.budget)} gp</b></label>
              <input className="fd-range" type="range" min={4} max={9.3} step={0.02}
                value={budgetSlider}
                onChange={(e) => setC({ budget: Math.round(Math.pow(10, +e.target.value)) })}
                aria-label="Bankroll" />
              <div className="fd-ends"><span>10k</span><span>2b</span></div>
            </div>
            <div className="fd-ctl">
              <label>Playstyle <b>{playLabel}</b></label>
              <input className="fd-range" type="range" min={0} max={1} step={0.01}
                value={ctl.play} onChange={(e) => setC({ play: +e.target.value })} aria-label="Playstyle" />
              <div className="fd-ends"><span>patient limits</span><span>5-min scalper</span></div>
            </div>
            <div className="fd-ctl">
              <label>Pricing tiebreak <b>{priceLabel}</b></label>
              <input className="fd-range" type="range" min={0} max={1} step={0.01}
                value={ctl.price} onChange={(e) => setC({ price: +e.target.value })} aria-label="Pricing tiebreak" />
              <div className="fd-ends"><span>full margin</span><span>fast fills</span></div>
            </div>
            <div className="fd-ctl">
              <label>Risk appetite <b>{riskLabel} ≤ {ctl.riskTol}</b></label>
              <input className="fd-range" type="range" min={15} max={100} step={1}
                value={ctl.riskTol} onChange={(e) => setC({ riskTol: +e.target.value })} aria-label="Risk appetite" />
              <div className="fd-ends"><span>careful</span><span>degen</span></div>
            </div>
            <div className="fd-ctl">
              <label>Min ROI after tax <b>{ctl.minRoi}%</b></label>
              <input className="fd-range" type="range" min={0} max={30} step={0.2}
                value={ctl.minRoi} onChange={(e) => setC({ minRoi: +e.target.value })} aria-label="Minimum ROI" />
              <div className="fd-ends"><span>any profit</span><span>30%+</span></div>
            </div>
            <div className="fd-ctl">
              <label style={{ marginBottom: 9 }}>Filters</label>
              <div className="fd-togs">
                <label className="fd-tog"><input type="checkbox" checked={ctl.taxFree} onChange={(e) => setC({ taxFree: e.target.checked })} />tax-free only (&lt;50 gp)</label>
                <label className="fd-tog"><input type="checkbox" checked={ctl.f2p} onChange={(e) => setC({ f2p: e.target.checked })} />F2P items only</label>
              </div>
            </div>
            <div className="fd-ctl">
              <label>Find an item</label>
              <input className="fd-search" placeholder="e.g. iron arrow, rune, whip…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </section>

        {/* desk plan */}
        {plan.lines.length > 0 && (
          <section className="fd-panel">
            <h2 className="fd-lab">Desk Plan — {plan.lines.length} of {plan.slots} slots · {fmtGp(plan.deployed)} deployed · est {fmtGp(plan.estLo)}–{fmtGp(plan.estHi)}/hr</h2>
            <div className="fd-planrows">
              {plan.lines.map((l, i) => (
                <button key={l.id} className="fd-planrow" onClick={() => setSelId(l.id)}>
                  <span className="slot">{i + 1}</span>
                  <span className="nm">{l.name}</span>
                  <span className="qty">{fmtQty(l.qty)} @ {fmtGp(l.buyP)} → {fmtGp(l.sellP)}</span>
                  <span className="cap">{fmtGp(l.capital)} out</span>
                  <span className="cyc">~{fmtDur(l.cycleH)}/cycle</span>
                  <span className="est">{fmtGp(l.gpHrLo)}–{fmtGp(l.gpHrHi)}/hr</span>
                </button>
              ))}
            </div>
            <p className="fd-note">
              Greedy allocation of your bankroll across {plan.slots} Grand Exchange slots{ctl.f2p ? " (F2P accounts get 3)" : ""}, best est. gp/hr first,
              each line re-sized to the coin left after the slots above it. Ranges bracket the capture guess (half to 1.5× the modelled share of flow).
              Tap a line to open its ledger below.
            </p>
          </section>
        )}

        {/* scoreboard */}
        {best && (
          <div className="fd-score">
            <button className="fd-card" onClick={() => setSelId(best.hr.id)}>
              <div className="k">Top earner · est. gp/hr</div>
              <div className="n">{best.hr.name}</div>
              <div className="v">{fmtGp(best.hr.gpHr)}/hr <span>· {fmtQty(best.hr.qty)} @ {fmtGp(best.hr.low)}</span></div>
            </button>
            <button className="fd-card" onClick={() => setSelId(best.roi.id)}>
              <div className="k">Fattest ROI after tax</div>
              <div className="n">{best.roi.name}</div>
              <div className="v">{best.roi.roi.toFixed(1)}% <span>· {fmtGp(best.roi.margin)} on {fmtGp(best.roi.low)}</span></div>
            </button>
            <button className="fd-card" onClick={() => setSelId(best.safe.id)}>
              <div className="k">Safest steady line</div>
              <div className="v" style={{ marginTop: 5 }}><RiskBadge risk={best.safe.risk} /></div>
              <div className="n">{best.safe.name}</div>
              <div className="v">{fmtGp(best.safe.gpHr)}/hr <span>· {fmtQty(best.safe.dv)} traded/day</span></div>
            </button>
          </div>
        )}

        {/* charts */}
        <div className="fd-charts">
          <section className="fd-panel">
            <h2 className="fd-lab">ROI vs. Liquidity — every dot is a trade you could run</h2>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid stroke="#33291A" strokeDasharray="2 4" />
                  <XAxis dataKey="dvLog" type="number" scale="log" domain={["auto", "auto"]}
                    tickFormatter={fmtQty} stroke="#7A6B54" fontSize={10} fontFamily="monospace"
                    label={{ value: "24h volume (log)", position: "insideBottom", offset: -2, fill: "#7A6B54", fontSize: 10 }} />
                  <YAxis dataKey="roiCap" type="number" stroke="#7A6B54" fontSize={10} fontFamily="monospace"
                    tickFormatter={(v) => v + "%"} width={44} />
                  <ZAxis dataKey="gpHr" range={[30, 340]} />
                  <RTooltip content={<ScatterTip />} cursor={{ strokeDasharray: "3 3", stroke: "#8A6F3D" }} />
                  <Scatter data={scatterData} onClick={(d) => { const id = d?.payload?.id ?? d?.id; if (id) setSelId(id); }}>
                    {scatterData.map((d) => (
                      <Cell key={d.id} fill={RISK_COLOR[riskBucket(d.risk)]}
                        fillOpacity={d.id === selId ? 1 : 0.55}
                        stroke={d.id === selId ? "#F0B437" : "none"} strokeWidth={2} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="fd-note">Up and to the right is the dream; up and to the left is a trap — fat ROI on a book nobody trades. Dot size is estimated gp/hr, colour is risk.</p>
          </section>

          <section className="fd-panel">
            <h2 className="fd-lab">Top lines on your rules</h2>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={topBars} layout="vertical" margin={{ top: 4, right: 14, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="#33291A" strokeDasharray="2 4" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtGp} stroke="#7A6B54" fontSize={10} fontFamily="monospace" />
                  <YAxis type="category" dataKey="shortName" width={120} stroke="#A5937A" fontSize={10.5} />
                  <RTooltip content={<BarTip />} cursor={{ fill: "#2A2113" }} />
                  <Bar dataKey="gpHr" onClick={(d) => { const id = d?.payload?.id ?? d?.id; if (id) setSelId(id); }} radius={[0, 2, 2, 0]}>
                    {topBars.map((d) => (
                      <Cell key={d.id} fill={d.id === selId ? "#F0B437" : "#C69A45"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="fd-note">Estimated gp/hr, capped by the 4-hour buy limit — churning faster than the limit allows earns nothing extra.</p>
          </section>
        </div>

        {/* table */}
        <section className="fd-panel">
          <h2 className="fd-lab">The Board — {sorted.length} trades pass · tap a row to open its ledger</h2>
          <div className="fd-tablewrap">
            <table className="fd-t">
              <thead>
                <tr>
                  <th className={sortKey === "name" ? "on" : ""} onClick={() => clickSort("name")}>Item</th>
                  <th className={sortKey === "buyP" ? "on" : ""} onClick={() => clickSort("buyP")}>Buy @</th>
                  <th className="hide-sm">Sell @</th>
                  <th className={sortKey === "margin" ? "on" : ""} onClick={() => clickSort("margin")}>Net</th>
                  <th className={sortKey === "roi" ? "on" : ""} onClick={() => clickSort("roi")}>ROI</th>
                  <th className={sortKey === "tBuyH" ? "on" : ""} onClick={() => clickSort("tBuyH", 1)}>Buy fill</th>
                  <th className={(sortKey === "tSellH" ? "on " : "") + "hide-sm"} onClick={() => clickSort("tSellH", 1)}>Sell fill</th>
                  <th className="hide-sm">Limit</th>
                  <th className={(sortKey === "dv" ? "on " : "") + "hide-sm"} onClick={() => clickSort("dv")}>24h vol</th>
                  <th className={sortKey === "risk" ? "on" : ""} onClick={() => clickSort("risk")}>Risk</th>
                  <th className={(sortKey === "perCycle" ? "on " : "") + "hide-sm"} onClick={() => clickSort("perCycle")}>Gp/cycle</th>
                  <th className={sortKey === "gpHr" ? "on" : ""} onClick={() => clickSort("gpHr")}>Est/hr</th>
                  <th className={(sortKey === "rocHr" ? "on " : "") + "hide-sm"} onClick={() => clickSort("rocHr")} title="Return on the capital deployed, per hour">%/hr</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 250).map((p) => {
                  const mom = momOf(p);
                  const dim = status === "snapshot" ? " dim" : "";
                  return (
                  <React.Fragment key={p.id}>
                    <tr className={p.id === selId ? "sel" : ""} onClick={() => setSelId(p.id === selId ? null : p.id)}>
                      <td>
                        <span className="fd-caret">{p.id === selId ? "▾" : "▸"}</span>
                        {p.name}
                        {mom && mom.dir !== "flat" && (
                          <span className={"fd-mom " + mom.dir} title={`5m vs 1h: buy side ${p.momLo != null ? p.momLo.toFixed(1) + "%" : "–"}, sell side ${p.momHi != null ? p.momHi.toFixed(1) + "%" : "–"}`}>
                            {mom.dir === "up" ? "▲" : "▼"}
                          </span>
                        )}
                        {p.tax === 0 && <span className="fd-taxfree">0% tax</span>}
                        {p.members ? <span className="fd-mem">P2P</span> : <span className="fd-f2p">F2P</span>}
                        {p.unconf && <span className="fd-unconf" title="Latest spread is far wider than the hour's average — probably one outlier print. Probe with 1 before committing.">unconfirmed</span>}
                        {p.contested && <span className="fd-unconf" title="The spread is already ground down to the tax — flippers are fighting over this book.">contested</span>}
                      </td>
                      <td>{fmtGp(p.buyP)}</td>
                      <td className="hide-sm">{fmtGp(p.sellP)}</td>
                      <td className={p.margin > 0 ? "up" : "dn"}>{fmtGp(p.margin)}</td>
                      <td className={p.roi > 0 ? "up" : "dn"}>{p.roi.toFixed(1)}%</td>
                      <td className={durClass(p.tBuyH) + dim}>{fmtDur(p.tBuyH)}</td>
                      <td className={"hide-sm " + durClass(p.tSellH) + dim}>{fmtDur(p.tSellH)}</td>
                      <td className="hide-sm mut">{fmtQty(p.limit)}</td>
                      <td className="hide-sm mut">{fmtQty(p.dv)}</td>
                      <td className={dim}><RiskBadge risk={p.risk} /></td>
                      <td className="hide-sm">{fmtGp(p.perCycle)}</td>
                      <td className={"gold" + dim} title={"midpoint " + fmtGp(p.gpHr) + "/hr — range brackets the capture guess"}>{fmtGp(p.gpHrLo)}–{fmtGp(p.gpHrHi)}</td>
                      <td className={"hide-sm mut" + dim}>{p.rocHr >= 10 ? Math.round(p.rocHr) : p.rocHr.toFixed(p.rocHr >= 1 ? 1 : 2)}%</td>
                    </tr>
                    {p.id === selId && (
                      <ExpandedRow sel={p} status={status} data={series[p.id]}
                        budget={ctl.budget} calF={calF} onLog={logFlip} onClose={() => setSelId(null)} />
                    )}
                  </React.Fragment>
                  );
                })}
                {sorted.length > 250 && (
                  <tr><td colSpan={13} style={{ textAlign: "center", padding: 10, color: "#7A6B54", cursor: "default" }}>
                    top 250 of {sorted.length.toLocaleString()} shown — sort, search, or tighten the rules to surface the rest
                  </td></tr>
                )}
                {!sorted.length && (
                  <tr><td colSpan={13} style={{ textAlign: "center", padding: 24, color: "#A5937A" }}>
                    Nothing passes these rules. Loosen the risk cap or minimum ROI, ease the offer-pricing dial back toward the touch, raise the bankroll, or clear the tax-free filter.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* flip ledger */}
        <LedgerPanel ledger={ledger} setLedger={setLedger} byId={byId}
          calibration={calibration} calOn={calOn} setCalOn={setCalOn}
          onSelect={(id) => setSelId(id)} />

        {/* ledger notes */}
        <section className="fd-panel">
          <h2 className="fd-lab">Ledger Notes — how this desk thinks</h2>
          <div className="fd-notes">
            <p><b>The tax.</b> The Exchange takes 2% of the sale price of every item, rounded down, capped at 5m per item. Anything that sells under 50 gp is exempt — which is why a 1 gp margin on iron arrows or iron nails is a clean 25–33% ROI while a 1% margin on a whip is roughly break-even after tax.</p>
            <p><b>Buy limits.</b> Every item caps how many you can buy per rolling 4 hours. Limits are the real ceiling on gp/hr: a 7,000-limit penny item can out-earn a big-ticket flip you can only buy 8 of. The est/hr column is always capped by limit ÷ 4h.</p>
            <p><b>Risk score.</b> Blended from three observable pressures: how thin the hourly flow is (will your offer fill?), how far the 5-minute price has drifted from the 1-hour average relative to your margin (will the move eat your edge?), and how stale the last trade is. Low ≤ 30, high ≥ 60. It measures fill-and-drift risk, not manipulation.</p>
            <p><b>The fill clock.</b> Your buy order fills from people insta-selling into the book; your sell order fills from insta-buyers. The desk reads each side's hourly flow separately and estimates how long an order of your size waits: quantity ÷ (that side's flow × your share of it). A fat margin on a book where the sell side moves 40 units an hour is a parked bankroll, and the clock says so before you learn it the hard way.</p>
            <p><b>Offer pricing.</b> The GE queue is price-time priority. Quoting at the touch (buy at insta-sell, sell at insta-buy) takes the full spread but stands you behind everyone already there — figure ~25% of counter-flow finds you. Stepping even 1 gp inside jumps the entire queue at that price, though rivals reprice too, so capture tops out around 2.4× the touch, not "most of the flow". The desk prices each item itself: it tries the touch, +1 gp inside, and a mid-spread cut, and ranks the item on whichever earns best — the tiebreak dial only decides near-ties between margin and speed. Each item's strategy table shows all three side by side.</p>
            <p><b>Playstyle.</b> The dial sets how long a round trip you'll tolerate: patient mode sizes stacks for ~4-hour cycles — set offers, log off, collect; scalper mode sizes them to turn in ~15 minutes and only makes sense on books deep enough to fill you fast.</p>
            <p><b>Confirmed vs. quoted.</b> The latest insta-buy/insta-sell are two individual trades — one bait or outlier print can fabricate a margin. The desk therefore ranks on the <i>confirmed</i> margin: it never assumes you sell above the last hour's average high or buy below its average low. When the quote is far richer than the hour's book, the row says <i>unconfirmed</i> — probe with 1 before committing.</p>
            <p><b>The tape's direction.</b> ▲/▼ beside an item is the signed 5-minute-vs-1-hour move. A falling tape is the classic knife: your buy fills instantly <i>because</i> everyone is selling, and the exit leg eats the move. The expanded ledger spells out which leg carries the risk.</p>
            <p><b>The Desk Plan.</b> You don't flip one item — you run up to 8 Grand Exchange slots against one bankroll. The plan greedily fills slots best est. gp/hr first, re-sizing each line to the coin left after the lines above it, and totals what the whole desk should earn as a range, not a point.</p>
            <p><b>Your Ledger.</b> Log a flip when you place it, close it with what you actually made. After two closes the desk knows your realized-vs-predicted ratio and can calibrate every estimate to it — the honest answer to "these numbers look too good". It lives in your browser; nothing leaves the page.</p>
            <p><b>Two worked personas.</b> The <i>penny bulk</i> preset is the &lt;50 gp, tax-exempt, high-ROI grind — iron arrows, nails, feathers, essence. The <i>5-minute scalps</i> preset hunts deep-volume items where the spread refills constantly and your money is never parked.</p>
            <p><b>On the wiki's API.</b> Prices come from the OSRS Wiki's free real-time API, and the desk is deliberately gentle with it: every endpoint is cached at its natural update cadence (the item map ~weekly, volumes hourly, the 1h book 15 min, the tape ~90 s), a hidden tab never polls, errors back off exponentially, and the refresh button can't bust the cache. Leaving the desk open costs the wiki roughly one small request a minute.</p>
            <p><b>What the numbers aren't.</b> Instant-buy and instant-sell prices are the last trades crossed, not guaranteed fills — a margin tagged <i>unconfirmed</i> means the latest spread is far wider than the hour's average, which usually smells like one outlier print: probe it with a single unit first. Fill clocks assume the last hour's flow keeps its pace and that you capture ~25% of it at the touch (more when you price inside) — generous on contested items, and blind to the queue already ahead of you. This is a lens for reading the market, not an order robot.</p>
          </div>
          <p className="fd-foot">
            prices &amp; volumes · OSRS Wiki real-time prices API (RuneLite) · snapshot baked {SNAP_DATE.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} · not affiliated with Jagex
          </p>
        </section>
      </div>
    </div>
  );
}

/* ================= expanded row ================= */
const timeTick = (t) => {
  const d = new Date(t * 1000);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
};

function ExpandedRow({ sel, status, data, budget, calF = 1, onLog, onClose }) {
  const rowRef = useRef(null);
  useEffect(() => { rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, []);
  const [logged, setLogged] = useState(false);

  /* same bankroll & attention window, three ways to price the offers —
     the desk has already picked the best earner (marked ◂) */
  const strats = useMemo(() => {
    const defs = [
      { label: "At the touch", step: 0 },
      { label: "+1 gp inside", step: 1 },
      { label: "Mid-spread cut", step: Math.round(sel.maxStep / 2) },
    ];
    const seen = new Set();
    return defs
      .filter((d) => d.step <= sel.maxStep && !seen.has(d.step) && seen.add(d.step))
      .sort((a, b) => a.step - b.step)
      .map((d) => ({ ...d, ...priceOut(sel, budget, sel.tolH, d.step, sel.qty) }));
  }, [sel, budget]);

  /* bracket the capture guess for honest ranges */
  const [pess, opt] = useMemo(() => [
    priceOut(sel, budget, sel.tolH, sel.step, sel.qty, 0.5),
    priceOut(sel, budget, sel.tolH, sel.step, sel.qty, 1.5),
  ], [sel, budget]);

  /* what the 24h tape says about this margin — computed from the one fetch.
     The denominator is EVERY 5-minute window: one where nothing traded on both
     sides is a window the margin did not exist as a fillable round trip. */
  const tape = useMemo(() => {
    if (!data?.pts || sel.margin <= 0) return null;
    const windows = Math.max(data.n || 0, data.pts.length);
    const pts = data.pts.filter((p) => p.hi && p.lo);
    if (pts.length < 24 || windows < 48) return null;
    const margins = pts.map((p) => p.hi - p.lo - geTax(p.hi, sel.id));
    const persist = margins.filter((m) => m >= sel.margin).length / windows;
    const twoSided = pts.length / windows;
    const mids = pts.map((p) => (p.hi + p.lo) / 2);
    const moves = mids.slice(1).map((m, i) => Math.abs(m - mids[i])).sort((a, b) => a - b);
    const typ = moves[Math.floor(moves.length / 2)] || 0;
    const lo = Math.min(...mids), hi = Math.max(...mids);
    const pos = hi > lo ? ((mids[mids.length - 1] - lo) / (hi - lo)) * 100 : 50;
    return { persist, twoSided, cushion: typ > 0 ? sel.margin / typ : null, pos };
  }, [data, sel]);

  const taxLine = sel.tax === 0
    ? (sel.sellP < 50 ? "tax exempt — sells under 50 gp" : "tax exempt item")
    : `tax is 2% of ${sel.sellP.toLocaleString()} = ${sel.tax.toLocaleString()} gp, rounded down`;
  const bars = [
    { k: "Fill risk", v: sel.fillR, note: fmtQty(sel.hv) + " traded last hour" },
    { k: "Drift risk", v: sel.driftR, note: (sel.vol == null ? "~" : sel.vol.toFixed(1) + "%") + " 5m-vs-1h drift" },
    { k: "Staleness", v: sel.staleR, note: "last trade " + agoStr(sel.stale) + (status === "snapshot" ? " at snapshot" : "") },
  ];
  const boundNote =
    sel.qty >= sel.limit ? "Buy-limit bound — your bankroll could take more, the Exchange won't sell it to you. Consider a second line."
      : sel.qty >= sel.afford ? "Bankroll bound — every coin is working. A bigger stack would buy up to the " + sel.limit.toLocaleString() + " limit."
      : "Cycle-bound — a bigger stack wouldn't round-trip inside your playstyle window. Give it more patience or price more aggressively.";

  return (
    <tr className="fd-exprow" ref={rowRef}>
      <td colSpan={13}>
        <div className="fd-expand">
          <div className="fd-exphead">
            <h3>{sel.name}</h3>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <RiskBadge risk={sel.risk} />
              <a className="fd-link" href={`https://prices.runescape.wiki/osrs/item/${sel.id}`} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}>wiki page ↗</a>
              {onLog && (
                <button className="fd-btn" disabled={logged} onClick={() => { onLog(sel); setLogged(true); }}>
                  {logged ? "✓ logged" : "✎ log this flip"}
                </button>
              )}
              <button className="fd-btn" onClick={onClose}>✕ close</button>
            </div>
          </div>

          <div className="fd-expgrid">
            <div className="fd-box">
              <h4>The Flip</h4>
              <div className="fd-kv"><span>Buy offer @</span><b>{fmtFull(sel.buyP)}{sel.step > 0 && <i className="fd-stepnote"> touch {fmtGp(sel.low)}</i>}</b></div>
              <div className="fd-kv"><span>Sell offer @</span><b>{fmtFull(sel.sellP)}{sel.step > 0 && <i className="fd-stepnote"> touch {fmtGp(sel.high)}</i>}</b></div>
              <div className="fd-kv"><span>GE tax</span><b className={sel.tax ? "r" : "g"}>{sel.tax ? "-" + fmtFull(sel.tax) : "0 gp"}</b></div>
              {sel.quotedMargin !== sel.margin && (
                <div className="fd-kv"><span>Quoted by latest prints</span><b>{fmtFull(sel.quotedMargin)}</b></div>
              )}
              <div className="fd-kv" style={{ borderTop: "1px solid #3A2E1B", marginTop: 4, paddingTop: 7 }}>
                <span>{sel.quotedMargin !== sel.margin ? "Net, confirmed by the 1h book" : "Net per unit"}</span>
                <b className={sel.margin > 0 ? "g" : "r"}>{fmtFull(sel.margin)} · {sel.roi.toFixed(1)}%</b>
              </div>
              <p className="fd-note">
                {sel.step > 0
                  ? `Priced ${sel.step} gp inside the spread on each side — queue-jumping the touch. ${taxLine}.`
                  : `Quoting at the touch for the full ${fmtGp(sel.high - sel.low)} spread. ${taxLine}.`}
                {" "}Buy limit {sel.limit.toLocaleString()} / 4h · {fmtQty(sel.dv)} traded in 24h.
              </p>
            </div>

            <div className="fd-box">
              <h4>Your Play</h4>
              <div className="fd-kv"><span>Quantity</span><b className="au">{sel.qty.toLocaleString()}</b></div>
              <div className="fd-kv"><span>Capital out</span><b>{fmtGp(sel.capital)} gp</b></div>
              <div className="fd-kv"><span>Buy order fills in</span><b className={durClass(sel.tBuyH)}>~{fmtDur(opt.tBuyH)}–{fmtDur(pess.tBuyH)}</b></div>
              <div className="fd-kv"><span>Sell order fills in</span><b className={durClass(sel.tSellH)}>~{fmtDur(opt.tSellH)}–{fmtDur(pess.tSellH)}</b></div>
              <div className="fd-kv"><span>Round trip</span><b>~{fmtDur(opt.cycleH)}–{fmtDur(pess.cycleH)}</b></div>
              <div className="fd-kv"><span>Profit / cycle</span><b className={sel.perCycle > 0 ? "g" : "r"}>{fmtGp(sel.perCycle)} gp</b></div>
              <div className="fd-kv"><span>Est. rate</span><b className="au">{fmtGp(pess.gpHr * calF)}–{fmtGp(opt.gpHr * calF)}/hr</b></div>
              <p className="fd-note">{boundNote}</p>
            </div>

            <div className="fd-box">
              <h4>Risk Read</h4>
              {bars.map((b) => (
                <div key={b.k}>
                  <div className="fd-kv" style={{ padding: "1px 0" }}><span>{b.k}</span><b style={{ fontSize: 11.5, color: "#A5937A" }}>{b.note}</b></div>
                  <div className="fd-riskbar"><i style={{ width: clamp(b.v, 2, 100) + "%", background: RISK_COLOR[riskBucket(b.v)] }} /></div>
                </div>
              ))}
              <p className="fd-note">
                Counter-flow last hour: ~{fmtQty(sel.hvLo)}/hr hit the buy side, ~{fmtQty(sel.hvHi)}/hr the sell side
                {sel.hvSplit ? "" : " (even split assumed — live feed refines this)"}.
                Your offers are modelled to capture ~{Math.round(sel.share * 100)}% of that flow at this pricing.
              </p>
              {sel.momHi != null && sel.momHi <= -0.75 && (
                <p className="fd-note fd-knife">▼ Falling tape — the sell side sits {sel.momHi.toFixed(1)}% under its hourly average.
                  Your buy fills because everyone is selling; the exit leg carries the risk. Wait it out, or price the sell aggressively and take the thinner net.</p>
              )}
              {sel.momLo != null && sel.momLo >= 0.75 && (sel.momHi == null || sel.momHi >= 0) && (
                <p className="fd-note fd-rise">▲ Rising tape — the buy side runs {sel.momLo.toFixed(1)}% above its hourly average.
                  Expect the buy leg to fill slowly at the touch; a step inside earns its keep here.</p>
              )}
            </div>
          </div>

          <div className="fd-box">
            <h4>Pricing the offers — margin vs. waiting time</h4>
            <div style={{ overflowX: "auto" }}>
              <table className="fd-strat">
                <thead>
                  <tr>
                    <th>Strategy</th><th>Buy @</th><th>Sell @</th><th>Net/unit</th><th>ROI</th>
                    <th>Buy fill</th><th>Sell fill</th><th>Est/hr</th>
                  </tr>
                </thead>
                <tbody>
                  {strats.map((s) => (
                    <tr key={s.step} className={s.step === sel.step ? "cur" : ""}>
                      <td>{s.label}{s.step === sel.step ? " ◂" : ""}</td>
                      <td>{fmtGp(s.buyP)}</td>
                      <td>{fmtGp(s.sellP)}</td>
                      <td className={s.margin > 0 ? "up" : "dn"}>{fmtGp(s.margin)}</td>
                      <td className={s.roi > 0 ? "up" : "dn"}>{s.roi.toFixed(1)}%</td>
                      <td className={durClass(s.tBuyH)}>{fmtDur(s.tBuyH)}</td>
                      <td className={durClass(s.tSellH)}>{fmtDur(s.tSellH)}</td>
                      <td style={{ color: "#F0B437" }}>{fmtGp(s.gpHr * calF)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fd-note">
              {sel.maxStep === 0
                ? "The book is only " + fmtGp(sel.high - sel.low) + " wide — there is no room to price inside it. Penny books are patient by nature."
                : "Same bankroll, same attention window — only the offer prices move. The desk quotes the best earner (◂) and your tiebreak dial settles near-ties. Stepping 1 gp inside jumps every offer waiting at the touch; deeper cuts only outbid other queue-jumpers."}
            </p>
          </div>

          <div className="fd-box">
            <h4>The Tape — last 24h · gold = sell side, green = buy side, bars = volume</h4>
            {tape && (
              <div className="fd-tapestats">
                <div className="fd-kv"><span>This margin existed</span><b>{Math.round(tape.persist * 100)}% of the last 24h</b></div>
                <div className="fd-kv"><span>Both sides traded</span><b className={tape.twoSided < 0.5 ? "r" : ""}>{Math.round(tape.twoSided * 100)}% of windows</b></div>
                <div className="fd-kv"><span>Margin vs typical 5m move</span><b className={tape.cushion != null && tape.cushion < 1 ? "r" : "g"}>{tape.cushion != null ? tape.cushion.toFixed(1) + "× cover" : "–"}</b></div>
                <div className="fd-kv"><span>Price in the day's range</span><b>{Math.round(tape.pos)}%{tape.pos <= 25 ? " — near the low" : tape.pos >= 75 ? " — near the high" : ""}</b></div>
              </div>
            )}
            {data?.pts?.length > 1 ? (
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <ComposedChart data={data.pts} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#33291A" strokeDasharray="2 4" />
                    <XAxis dataKey="t" tickFormatter={timeTick} stroke="#7A6B54" fontSize={10}
                      fontFamily="monospace" minTickGap={48} />
                    <YAxis yAxisId="p" domain={["auto", "auto"]} tickFormatter={fmtGp} stroke="#7A6B54"
                      fontSize={10} fontFamily="monospace" width={54} />
                    <YAxis yAxisId="v" orientation="right" hide domain={[0, (max) => max * 4]} />
                    <RTooltip content={({ active, payload, label }) => active && payload?.length ? (
                      <div className="fd-tip">
                        <b>{timeTick(label)}</b>
                        {payload.map((p) => (
                          <div key={p.dataKey}>
                            {p.dataKey === "hi" ? "sell " + fmtGp(p.value) : p.dataKey === "lo" ? "buy " + fmtGp(p.value) : "vol " + fmtQty(p.value)}
                          </div>
                        ))}
                      </div>
                    ) : null} />
                    <Bar yAxisId="v" dataKey="v" fill="#57452A" fillOpacity={0.55} isAnimationActive={false} />
                    <Line yAxisId="p" type="monotone" dataKey="hi" stroke="#F0B437" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                    <Line yAxisId="p" type="monotone" dataKey="lo" stroke="#83CE70" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="fd-note" style={{ marginTop: 6 }}>
                {data?.err || status === "snapshot"
                  ? "Price history needs the live feed — offline right now."
                  : "Pulling the 24-hour tape…"}
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ================= flip ledger ================= */
function LedgerPanel({ ledger, setLedger, byId, calibration, calOn, setCalOn, onSelect }) {
  const [closing, setClosing] = useState(null); // uid mid-close
  const [realIn, setRealIn] = useState("");
  const [minIn, setMinIn] = useState("");

  const open = ledger.filter((l) => l.status === "open");
  const closed = ledger.filter((l) => l.status === "closed");
  const realized = closed.reduce((s, l) => s + (l.realNet || 0), 0);
  const openCap = open.reduce((s, l) => s + l.qty * l.buyP, 0);
  // how long flips really take vs the clock's guess, from close-outs that gave a time
  const cycleCal = (() => {
    const timed = closed.filter((l) => l.realMin > 0 && l.predCycleH > 0);
    if (timed.length < 2) return null;
    const pred = timed.reduce((s, l) => s + l.predCycleH, 0);
    const real = timed.reduce((s, l) => s + l.realMin / 60, 0);
    return real / pred;
  })();

  const close = (uid) => {
    if (realIn.trim() === "") return; // an empty close would record 0 gp and poison calibration
    const n = Math.round(Number(realIn));
    if (!isFinite(n)) return;
    const mins = Math.round(Number(minIn));
    setLedger((L) => L.map((l) => (l.uid === uid
      ? { ...l, status: "closed", realNet: n, realMin: isFinite(mins) && mins > 0 ? mins : null, closedTs: Date.now() }
      : l)));
    setClosing(null); setRealIn(""); setMinIn("");
  };
  const del = (uid) => setLedger((L) => L.filter((l) => l.uid !== uid));

  return (
    <section className="fd-panel">
      <h2 className="fd-lab">Your Ledger — {open.length} open · {fmtGp(openCap)} deployed · {fmtGp(realized)} realized</h2>
      {!ledger.length && (
        <p className="fd-note">
          Nothing logged yet. Open an item and hit “✎ log this flip” when you place the offers, then close it out
          with what you actually made. Once two flips are closed, the desk starts calibrating its estimates to your
          results — the one thing no spreadsheet of quoted margins can do. Stored in this browser only.
        </p>
      )}
      {!!ledger.length && (
        <div style={{ overflowX: "auto" }}>
          <table className="fd-lt">
            <thead><tr><th>Flip</th><th>Qty</th><th>Buy @</th><th>Sell @</th><th>Predicted</th><th>Mark / realized</th><th>Age</th><th></th></tr></thead>
            <tbody>
              {[...ledger].sort((a, b) => b.ts - a.ts).slice(0, 30).map((l) => {
                const cur = byId.get(l.id);
                // mark the position you HOLD: today's realistic exit against YOUR entry price
                const exitP = cur ? (cur.avgHi ? Math.min(cur.high, cur.avgHi) : cur.high) : null;
                const mark = l.status === "open" && exitP != null
                  ? (exitP - geTax(exitP, l.id) - l.buyP) * l.qty : null;
                return (
                  <tr key={l.uid} className={l.status === "closed" ? "closedRow" : ""}>
                    <td>
                      <button className="fd-linkbtn" onClick={() => onSelect(l.id)}>{l.name}</button>
                      {l.status === "closed" && <span className="fd-taxfree">closed</span>}
                    </td>
                    <td>{fmtQty(l.qty)}</td>
                    <td>{fmtGp(l.buyP)}</td>
                    <td>{fmtGp(l.sellP)}</td>
                    <td>{fmtGp(l.predNet)}</td>
                    <td>
                      {l.status === "closed" ? (
                        <b className={l.realNet >= 0 ? "up" : "dn"}>{fmtGp(l.realNet)}</b>
                      ) : closing === l.uid ? (
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                          <input className="fd-in" type="number" placeholder="realized gp"
                            value={realIn} onChange={(e) => setRealIn(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && close(l.uid)} autoFocus />
                          <input className="fd-in" type="number" placeholder="mins (opt.)" style={{ width: 76 }}
                            value={minIn} onChange={(e) => setMinIn(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && close(l.uid)} />
                          <button className="fd-btn" onClick={() => close(l.uid)}>save</button>
                        </span>
                      ) : (
                        <span className={mark != null && mark < l.predNet ? "dn" : "mut"}>
                          {mark != null ? "mark " + fmtGp(mark) : "–"}
                        </span>
                      )}
                    </td>
                    <td className="mut">{agoStr((Date.now() - l.ts) / 60000)}</td>
                    <td>
                      {l.status === "open" && closing !== l.uid && (
                        <button className="fd-btn" onClick={() => { setClosing(l.uid); setRealIn(""); }}>close</button>
                      )}{" "}
                      <button className="fd-btn" onClick={() => del(l.uid)} title="remove entry">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(calibration != null || closed.length === 1) && (
        <div className="fd-calrow">
          {calibration != null ? (
            <>
              <span>
                Across {closed.length} closed flips you realized {calibration <= 0
                  ? "a net loss against predicted profit — the estimates say nothing until the leaks stop"
                  : `~${Math.round(calibration * 100)}% of predicted profit (gp-weighted, losses included)`}.
                {cycleCal != null && <> Cycles ran ~{cycleCal < 1 ? Math.round((1 / cycleCal) * 10) / 10 + "× faster" : Math.round(cycleCal * 10) / 10 + "× slower"} than the clocks guessed.</>}
              </span>
              <label className="fd-tog">
                <input type="checkbox" checked={calOn} onChange={(e) => setCalOn(e.target.checked)} />
                calibrate estimates to my results
              </label>
            </>
          ) : (
            <span>Close one more flip and the desk can start calibrating estimates to your results.</span>
          )}
        </div>
      )}
    </section>
  );
}
