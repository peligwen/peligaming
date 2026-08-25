import React, { useState, useEffect, useMemo, useCallback } from "react";
import RECIPES from "./recipes.json";

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
const fmtFull = (n) => (n == null ? "–" : Math.round(n).toLocaleString());
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
  if (h == null || !isFinite(h)) return "never";
  const m = h * 60;
  if (m < 1) return "under a minute";
  if (m < 60) return Math.round(m) + " min";
  if (h < 48) return (h < 10 ? +h.toFixed(1) : Math.round(h)) + " hr";
  return Math.round(h / 24) + " days";
};
const fmtDurShort = (h) => {
  if (h == null || !isFinite(h)) return "—";
  const m = h * 60;
  if (m < 1) return "<1 min";
  if (m < 60) return Math.round(m) + " min";
  if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + " hr";
  return Math.round(h / 24) + " days";
};
// colour a fill-time: fast fills green, slow fills red
const durClass = (h) => (!isFinite(h) ? "bad" : h <= 0.25 ? "good" : h <= 2 ? "" : h <= 8 ? "warn" : "bad");

/* ================= data shaping ================= */
const rowToItem = (r) => ({
  id: r[0], name: r[1], limit: r[2], members: !!r[3],
  low: r[4], high: r[5], hv: r[6], dv: r[7],
  // snapshot stores combined hourly flow; assume an even split until live data lands
  hvLo: r[6] / 2, hvHi: r[6] / 2,
  unconf: false, staleHi: r[9], staleLo: r[9],
});
const BASE_ITEMS = SNAPSHOT.items.map(rowToItem);

/* ================= fill-time model =================
   The GE queue is price-time priority. At the touch (buy at the insta-sell
   price, sell at the insta-buy price) you sit behind everyone already quoted
   there — assume you capture ~25% of the counter-flow. Stepping even 1 gp
   inside the spread jumps the whole queue at that price, so capture leaps;
   deeper steps only outbid other steppers, so it tops out near 60%.
   Your buy order fills from insta-sellers (hvLo), your sell from insta-buyers (hvHi). */
const SHARE_TOUCH = 0.25;
const shareOf = (step, maxStep) =>
  step <= 0 ? SHARE_TOUCH : 0.5 + 0.1 * (maxStep > 0 ? step / maxStep : 1);

const maxStepOf = (it) => Math.max(0, Math.floor((it.high - it.low - 1) / 2));

/* one priced order pair: step gp inside the spread on each side, qty units */
function quoteOrders(it, step, qty) {
  const maxStep = maxStepOf(it);
  step = clamp(step, 0, maxStep);
  const buyP = it.low + step;
  const sellP = it.high - step;
  const tax = geTax(sellP, it.id);
  const margin = sellP - buyP - tax;
  const roi = buyP > 0 ? (margin / buyP) * 100 : 0;
  const share = clamp(shareOf(step, maxStep), 0.05, 0.95);
  const buyRate = it.hvLo * share;   // units/hour your buy offer absorbs
  const sellRate = it.hvHi * share;
  const q = clamp(Math.round(qty) || 1, 1, it.limit);
  const tBuyH = buyRate > 0 ? Math.max(q / buyRate, 1 / 60) : Infinity;
  const tSellH = sellRate > 0 ? Math.max(q / sellRate, 1 / 60) : Infinity;
  return {
    step, maxStep, buyP, sellP, tax, margin, roi, share, buyRate, sellRate,
    qty: q, tBuyH, tSellH, cycleH: tBuyH + tSellH,
    cost: q * buyP, back: q * (sellP - tax), profit: q * margin,
  };
}

/* touch-price stats for the board: margin, ROI, and the round trip for a full limit */
function assess(it) {
  const tax = geTax(it.high, it.id);
  const margin = it.high - it.low - tax;
  const roi = it.low > 0 ? (margin / it.low) * 100 : 0;
  const bR = it.hvLo * SHARE_TOUCH, sR = it.hvHi * SHARE_TOUCH;
  const flipH = (bR > 0 ? it.limit / bR : Infinity) + (sR > 0 ? it.limit / sR : Infinity);
  return { ...it, tax, margin, roi, flipH };
}

/* ================= api citizenship =================
   The wiki's price API is a free community service run for RuneLite users.
   This board is deliberately polite with it:
   - every endpoint is cached at its natural update cadence (latest ~1min,
     1h refreshed 15min, volumes hourly, mapping ~weekly)
   - concurrent callers share a single in-flight request
   - errors back off exponentially PER ENDPOINT, serving stale data meanwhile
   - a hidden tab never polls; the refresh button can't bust the cache      */
const TTL = {
  latest: 85_000, "1h": 900_000,
  volumes: 3_600_000, mapping: 7 * 86_400_000,
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
  const meta = uni || BASE_ITEMS;      // no mapping? fall back to the baked classics
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
    // highPriceVolume = trades at insta-buy (fills YOUR sell offer); lowPriceVolume = insta-sells (fills YOUR buy offer)
    const hvHi = h.highPriceVolume || 0;
    const hvLo = h.lowPriceVolume || 0;
    // highTime = last insta-buy (your SELL leg's evidence); lowTime = last insta-sell (your BUY leg's)
    const staleHi = Math.round((now - (p.highTime || now)) / 60);
    const staleLo = Math.round((now - (p.lowTime || now)) / 60);
    // a latest spread far wider than the hour's average is usually one bait or
    // outlier print, not a margin you can capture — flag it, don't chase it
    const avgSpread = h.avgHighPrice && h.avgLowPrice ? h.avgHighPrice - h.avgLowPrice : null;
    const unconf = avgSpread == null || avgSpread <= 0 || high - low > Math.max(1.5 * avgSpread, avgSpread + 2);
    items.push({
      id: base.id, name: base.name, limit: base.limit, members: base.members,
      low, high, hv: hvHi + hvLo, hvHi, hvLo, unconf,
      dv: vols.data?.[base.id] ?? 0,
      staleHi, staleLo,
    });
  }
  if (items.length < 20) throw new Error("thin response");
  return { items, universe: !!uni };
}

/* ================= styles — old-school interface ================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap');
.ge-root {
  --stone:#3e3529; --stone-hi:#554a38; --stone-lo:#241f18; --edge:#0d0b08;
  --inset:#2b2620; --inset2:#211d17;
  --orange:#ff981f; --yellow:#ffe93f; --white:#f3ecdc; --tan:#b3a284; --dark-tan:#8a7a5f;
  --good:#57d957; --warn:#e8b13c; --bad:#f26060;
  --mono:ui-monospace,'Cascadia Code','SF Mono',Menlo,Consolas,monospace;
  --disp:'Cinzel',Georgia,'Times New Roman',serif;
  background:#1b1712; color:var(--white); min-height:100vh;
  font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;
  font-size:14px; line-height:1.45;
}
.ge-root *, .ge-root *::before, .ge-root *::after { box-sizing:border-box; }
.ge-wrap { max-width:1020px; margin:0 auto; padding:18px 14px 48px; }
.ge-shadow { text-shadow:1px 1px 0 #000; }

/* the classic beveled stone panel */
.ge-panel {
  background:var(--stone);
  border:1px solid var(--edge); border-radius:2px;
  box-shadow:inset 1px 1px 0 var(--stone-hi), inset -1px -1px 0 var(--stone-lo);
  padding:12px 14px; margin-bottom:12px;
}
.ge-inset {
  background:var(--inset);
  border:1px solid var(--edge); border-radius:2px;
  box-shadow:inset 1px 1px 0 #1a1712, inset -1px -1px 0 #38322a;
}

/* masthead */
.ge-mast { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
.ge-title { font-family:var(--disp); font-weight:700; font-size:clamp(24px,4.5vw,36px); letter-spacing:.05em;
  color:var(--orange); margin:0; line-height:1.05; text-shadow:2px 2px 0 #000; }
.ge-sub { font-size:12.5px; color:var(--tan); margin:4px 0 0; letter-spacing:.14em; text-transform:uppercase; text-shadow:1px 1px 0 #000; }
.ge-rule { height:2px; border:none; margin:0 0 14px;
  background:linear-gradient(90deg,transparent,#8a6f3d 10%,var(--orange) 50%,#8a6f3d 90%,transparent); }
.ge-status { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ge-chip { display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:11px; letter-spacing:.1em;
  padding:4px 10px; border:1px solid var(--edge); border-radius:2px; background:var(--inset); white-space:nowrap;
  box-shadow:inset 1px 1px 0 #1a1712; }
.ge-chip.live { color:var(--good); }
.ge-chip.snap { color:var(--warn); }
.ge-chip.load { color:var(--tan); }
.ge-dot { width:6px; height:6px; border-radius:50%; background:currentColor; animation:ge-pulse 2s ease-in-out infinite; }
@keyframes ge-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
@media (prefers-reduced-motion: reduce){ .ge-dot{animation:none} }

/* stone button */
.ge-btn {
  font-family:inherit; font-size:12.5px; color:var(--white); text-shadow:1px 1px 0 #000;
  background:var(--stone); border:1px solid var(--edge); border-radius:2px; padding:5px 13px; cursor:pointer;
  box-shadow:inset 1px 1px 0 var(--stone-hi), inset -1px -1px 0 var(--stone-lo);
}
.ge-btn:hover { color:var(--yellow); }
.ge-btn:active { box-shadow:inset 1px 1px 0 var(--stone-lo), inset -1px -1px 0 var(--stone-hi); }
.ge-btn:disabled { opacity:.45; cursor:default; color:var(--tan); }
.ge-root button:focus-visible, .ge-root input:focus-visible, .ge-root select:focus-visible, .ge-root a:focus-visible, .ge-root tr:focus-visible { outline:2px solid var(--yellow); outline-offset:1px; }

/* warning banner */
.ge-warn { border:1px solid #6e5426; background:#33270f; color:#f1d08a; border-radius:2px;
  padding:9px 12px; margin-bottom:12px; font-size:13px; text-shadow:1px 1px 0 #000; }
.ge-warn b { color:var(--yellow); }

/* market line */
.ge-read { font-size:13px; color:var(--tan); margin:0 0 12px; text-shadow:1px 1px 0 #000; }
.ge-read b { color:var(--orange); }

/* filter bar */
.ge-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.ge-filters .grow { flex:1 1 180px; }
.ge-in, .ge-sel {
  font-family:inherit; font-size:13px; color:var(--white); width:100%;
  background:var(--inset); border:1px solid var(--edge); border-radius:2px; padding:6px 9px;
  box-shadow:inset 1px 1px 0 #1a1712;
}
.ge-sel { width:auto; cursor:pointer; }
.ge-in::placeholder { color:var(--dark-tan); }
.ge-tog { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--white); cursor:pointer;
  user-select:none; white-space:nowrap; text-shadow:1px 1px 0 #000; }
.ge-tog input { accent-color:var(--orange); width:15px; height:15px; }

/* the board */
.ge-tablewrap { overflow:auto; max-height:calc(100vh - 130px); }
.ge-tablewrap::-webkit-scrollbar { width:12px; height:12px; }
.ge-tablewrap::-webkit-scrollbar-track { background:var(--inset2); }
.ge-tablewrap::-webkit-scrollbar-thumb { background:var(--stone); border:1px solid var(--edge); }
table.ge-t { border-collapse:collapse; width:100%; font-size:13px; min-width:700px; }
.ge-t thead th { position:sticky; top:0; z-index:2; background:var(--stone); color:var(--orange);
  font-weight:600; font-size:11px; letter-spacing:.12em; text-transform:uppercase; text-align:right;
  padding:8px 10px; border-bottom:2px solid var(--edge); cursor:pointer; white-space:nowrap;
  text-shadow:1px 1px 0 #000; box-shadow:inset 0 1px 0 var(--stone-hi); }
.ge-t thead th:first-child { text-align:left; }
.ge-t thead th.on { color:var(--yellow); }
.ge-t thead th .arr { font-size:9px; margin-left:3px; }
.ge-t tbody td { padding:6px 10px; text-align:right; font-family:var(--mono); font-size:12.5px;
  border-bottom:1px solid #221d16; white-space:nowrap; }
.ge-t tbody td:first-child { text-align:left; font-family:inherit; font-size:13px; }
.ge-t tbody tr { cursor:pointer; }
.ge-t tbody tr:hover { background:#332c22; }
.ge-t tbody tr:hover td:first-child .nm { color:var(--yellow); }
.ge-t .nm { color:var(--white); text-shadow:1px 1px 0 #000; }
.ge-t .good { color:var(--good); } .ge-t .bad { color:var(--bad); } .ge-t .warn { color:var(--warn); }
.ge-t .mut { color:var(--tan); } .ge-t .gold { color:var(--orange); }
.ge-mem { color:#d0a0e8; font-size:10px; margin-left:6px; border:1px solid #5a4470; border-radius:2px; padding:0 4px; font-family:var(--mono); }
.ge-flag { color:var(--warn); font-size:10px; margin-left:6px; border:1px dashed #6e5426; border-radius:2px; padding:0 4px; font-family:var(--mono); cursor:help; }
.ge-more { padding:9px 12px; font-size:12px; color:var(--tan); text-align:center; }
@media (max-width:720px){ .hide-sm{display:none} table.ge-t{min-width:520px} }
@media (max-width:480px){ .hide-xs{display:none} table.ge-t{min-width:0}
  .ge-t tbody td:first-child{max-width:160px; overflow:hidden; text-overflow:ellipsis} }

/* popup */
.ge-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:50;
  display:flex; align-items:center; justify-content:center; padding:14px; }
.ge-modal { width:min(660px,100%); max-height:92vh; overflow:auto;
  background:var(--stone); border:2px solid var(--edge); border-radius:3px;
  box-shadow:inset 1px 1px 0 var(--stone-hi), inset -1px -1px 0 var(--stone-lo), 0 12px 40px rgba(0,0,0,.7); }
.ge-mhead { display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:10px 14px; border-bottom:2px solid var(--edge); }
.ge-mhead h2 { margin:0; font-family:var(--disp); font-weight:700; font-size:19px; color:var(--orange);
  letter-spacing:.03em; text-shadow:2px 2px 0 #000; }
.ge-x { width:26px; height:26px; flex:none; display:flex; align-items:center; justify-content:center;
  background:#7a1f1f; color:#fff; font-size:13px; font-weight:700; cursor:pointer;
  border:1px solid var(--edge); border-radius:2px;
  box-shadow:inset 1px 1px 0 #a34040, inset -1px -1px 0 #4d1010; }
.ge-x:hover { background:#933030; }
.ge-mbody { padding:12px 14px 16px; }
.ge-meta { display:flex; gap:6px 16px; flex-wrap:wrap; font-size:12px; color:var(--tan);
  margin:0 0 12px; text-shadow:1px 1px 0 #000; }
.ge-meta b { color:var(--white); font-family:var(--mono); font-weight:600; }

/* the two order tickets */
.ge-orders { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
@media (max-width:560px){ .ge-orders{grid-template-columns:1fr} }
.ge-order { padding:10px 12px; }
.ge-order .k { font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; font-weight:600;
  margin-bottom:6px; text-shadow:1px 1px 0 #000; }
.ge-order.buy .k { color:var(--good); } .ge-order.sell .k { color:var(--bad); }
.ge-order .p { font-family:var(--mono); font-size:19px; font-weight:600; color:var(--orange); text-shadow:1px 1px 0 #000; }
.ge-order .p span { font-size:12px; color:var(--tan); font-weight:400; }
.ge-order .fill { font-size:12.5px; margin-top:6px; font-family:var(--mono); }
.ge-order .fill b { font-weight:600; }
.ge-order .fill .good { color:var(--good); } .ge-order .fill .warn { color:var(--warn); } .ge-order .fill .bad { color:var(--bad); }
.ge-order .sub { font-size:11px; color:var(--dark-tan); margin-top:4px; line-height:1.4; }

/* margin slider */
.ge-slider { margin-bottom:12px; padding:10px 12px; }
.ge-slider .lab { display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;
  font-size:12px; color:var(--tan); margin-bottom:6px; text-shadow:1px 1px 0 #000; }
.ge-slider .lab b { font-family:var(--mono); font-size:14px; color:var(--yellow); font-weight:600; }
input.ge-range { -webkit-appearance:none; appearance:none; width:100%; height:20px; background:transparent; cursor:pointer; margin:0; display:block; }
input.ge-range::-webkit-slider-runnable-track { height:6px; border-radius:2px; background:var(--inset2); border:1px solid var(--edge); }
input.ge-range::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:2px; margin-top:-6px;
  background:linear-gradient(180deg,#ffd06a,var(--orange) 60%,#b06510); border:1px solid var(--edge); box-shadow:0 1px 3px rgba(0,0,0,.6); }
input.ge-range::-moz-range-track { height:6px; border-radius:2px; background:var(--inset2); border:1px solid var(--edge); }
input.ge-range::-moz-range-thumb { width:15px; height:15px; border-radius:2px; background:var(--orange); border:1px solid var(--edge); }
input.ge-range:disabled { opacity:.4; cursor:default; }
.ge-ends { display:flex; justify-content:space-between; font-size:10.5px; color:var(--dark-tan); margin-top:3px; }
.ge-hint { font-size:11.5px; color:var(--tan); margin-top:7px; line-height:1.45; }

/* qty + summary */
.ge-qtyrow { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; margin-bottom:12px; text-shadow:1px 1px 0 #000; }
.ge-qtyrow input { width:110px; font-family:var(--mono); }
.ge-qtyrow .cap { color:var(--dark-tan); font-size:11.5px; }
.ge-sumrow { display:flex; gap:8px 22px; flex-wrap:wrap; padding:10px 12px; font-family:var(--mono); font-size:13px; margin-bottom:10px; }
.ge-sumrow div span { display:block; font-family:'Segoe UI',system-ui,sans-serif; font-size:10.5px; color:var(--tan);
  letter-spacing:.1em; text-transform:uppercase; margin-bottom:2px; text-shadow:1px 1px 0 #000; }
.ge-sumrow div b { font-weight:600; color:var(--white); }
.ge-sumrow .good { color:var(--good); } .ge-sumrow .bad { color:var(--bad); } .ge-sumrow .gold { color:var(--orange); }
.ge-note { font-size:11.5px; color:var(--tan); line-height:1.5; margin:8px 0 0; }
.ge-note.caution { color:#f1c286; }
.ge-link { color:var(--orange); text-decoration:none; border-bottom:1px dotted var(--orange); font-size:12px; }
.ge-link:hover { color:var(--yellow); border-color:var(--yellow); }

.ge-foot { text-align:center; color:var(--dark-tan); font-size:11px; margin-top:18px; line-height:1.6; }

/* tabs */
.ge-tabs { display:flex; gap:6px; margin-bottom:12px; }
.ge-tab {
  font-family:var(--disp); font-weight:600; font-size:13px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--tan); text-shadow:1px 1px 0 #000; background:var(--inset2);
  border:1px solid var(--edge); border-bottom:none; border-radius:3px 3px 0 0; padding:7px 18px 6px; cursor:pointer;
  box-shadow:inset 1px 1px 0 #1a1712;
}
.ge-tab.on {
  color:var(--orange); background:var(--stone);
  box-shadow:inset 1px 1px 0 var(--stone-hi);
}
.ge-tab:hover { color:var(--yellow); }

/* job board */
.ge-modebar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.ge-mode { font-size:12.5px; }
.ge-mode.on { color:var(--yellow); box-shadow:inset 1px 1px 0 var(--stone-lo), inset -1px -1px 0 var(--stone-hi); }
.ge-sheet { display:flex; gap:8px 14px; align-items:center; flex-wrap:wrap; font-size:12.5px; text-shadow:1px 1px 0 #000; }
.ge-sheet .sk { display:inline-flex; align-items:center; gap:5px; color:var(--tan); }
.ge-sheet .sk input { width:52px; text-align:right; font-family:var(--mono); padding:4px 6px; }
.ge-job { padding:0; overflow:hidden; }
.ge-jobhead { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap;
  padding:9px 13px 7px; }
.ge-jobhead h3 { margin:0; font-family:var(--disp); font-weight:700; font-size:16.5px; color:var(--orange);
  letter-spacing:.02em; text-shadow:2px 2px 0 #000; }
.ge-pay { font-family:var(--mono); font-size:17px; font-weight:600; text-shadow:1px 1px 0 #000; white-space:nowrap; }
.ge-pay.good { color:var(--good); } .ge-pay.bad { color:var(--bad); }
.ge-jobmeta { display:flex; gap:5px 14px; flex-wrap:wrap; font-size:11.5px; color:var(--tan);
  padding:0 13px 8px; text-shadow:1px 1px 0 #000; }
.ge-req { font-family:var(--mono); font-size:11px; border:1px solid var(--edge); border-radius:2px; padding:0 5px; }
.ge-req.ok { color:var(--good); } .ge-req.no { color:var(--bad); } .ge-req.unk { color:var(--tan); }
.ge-joblines { margin:0 13px 10px; padding:8px 11px; font-family:var(--mono); font-size:12.5px; line-height:1.75; }
.ge-joblines .op { display:inline-block; width:52px; font-weight:700; letter-spacing:.06em; font-size:11px; }
.ge-joblines .op.buy { color:var(--good); } .ge-joblines .op.work { color:var(--orange); } .ge-joblines .op.sell { color:var(--bad); }
.ge-joblines .clock { color:var(--dark-tan); font-size:11.5px; }
.ge-jobsum { display:flex; align-items:center; justify-content:space-between; gap:8px 18px; flex-wrap:wrap;
  padding:8px 13px 11px; border-top:1px solid #221d16; }
.ge-jobsum .facts { display:flex; gap:6px 20px; flex-wrap:wrap; font-family:var(--mono); font-size:12.5px; }
.ge-jobsum .facts div span { display:block; font-family:'Segoe UI',system-ui,sans-serif; font-size:10px; color:var(--tan);
  letter-spacing:.1em; text-transform:uppercase; margin-bottom:1px; text-shadow:1px 1px 0 #000; }
.ge-jobsum .facts div b { font-weight:600; color:var(--white); }
.ge-jobsum .facts .good { color:var(--good); } .ge-jobsum .facts .bad { color:var(--bad); } .ge-jobsum .facts .gold { color:var(--orange); }
.ge-batch { display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:12.5px; }
.ge-batch .ge-btn { padding:3px 9px; font-family:var(--mono); }
.ge-batch b { min-width:52px; text-align:center; color:var(--yellow); }
`;

/* ================= item popup ================= */
function ItemPopup({ it, status, onClose }) {
  const maxStep = maxStepOf(it);
  // the slider stops where profit does: the deepest step that still breaks even
  // after tax (tax grows as a share of a shrinking spread, so margin can go
  // negative well before the prices meet in the middle)
  const marginAt = (s) => it.high - it.low - 2 * s - geTax(it.high - s, it.id);
  let bkStep = 0;
  if (marginAt(0) > 0) {
    let lo = 0, hi = maxStep;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (marginAt(mid) >= 0) lo = mid; else hi = mid - 1;
    }
    bkStep = lo;
  }
  const [step, setStep] = useState(0);
  const [qty, setQty] = useState(it.limit);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const o = quoteOrders(it, step, qty);
  const wikiName = it.name.replace(/ /g, "_");

  return (
    <div className="ge-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ge-modal" role="dialog" aria-modal="true" aria-label={it.name}>
        <div className="ge-mhead">
          <h2>{it.name}</h2>
          <button className="ge-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ge-mbody">

          <div className="ge-meta">
            <span>{it.members ? "Members" : "Free-to-play"}</span>
            <span>Buy limit <b>{it.limit.toLocaleString()}</b> / 4h</span>
            <span>Traded <b>{fmtQty(it.dv)}</b> / day</span>
            {o.tax === 0 && <span style={{ color: "var(--good)" }}>No GE tax</span>}
          </div>

          {/* the recommended orders */}
          <div className="ge-orders">
            <div className="ge-order buy ge-inset">
              <div className="k">Buy Offer</div>
              <div className="p">{fmtFull(o.buyP)} <span>gp each × {fmtFull(o.qty)}</span></div>
              <div className="fill">fills in ≈ <b className={durClass(o.tBuyH)}>{fmtDur(o.tBuyH)}</b></div>
              <div className="sub">
                {o.buyRate > 0
                  ? <>~{fmtQty(it.hvLo)} insta-sold last hour; your share ≈ {Math.round(o.share * 100)}%. Last insta-sell {agoStr(it.staleLo)}.</>
                  : <>Nobody insta-sold this in the last hour — a buy offer here just sits.</>}
              </div>
            </div>
            <div className="ge-order sell ge-inset">
              <div className="k">Sell Offer</div>
              <div className="p">{fmtFull(o.sellP)} <span>gp each × {fmtFull(o.qty)}</span></div>
              <div className="fill">fills in ≈ <b className={durClass(o.tSellH)}>{fmtDur(o.tSellH)}</b></div>
              <div className="sub">
                {o.tax > 0 ? <>GE tax takes {fmtFull(o.tax)} gp each. </> : null}
                {o.sellRate > 0
                  ? <>~{fmtQty(it.hvHi)} insta-bought last hour; your share ≈ {Math.round(o.share * 100)}%. Last insta-buy {agoStr(it.staleHi)}.</>
                  : <>Nobody insta-bought this in the last hour — a sell offer here just sits.</>}
              </div>
            </div>
          </div>

          {/* margin slider */}
          <div className="ge-slider ge-inset">
            <div className="lab">
              <span>Margin per item: <b>{fmtFull(o.margin)} gp</b> <span style={{ color: o.margin > 0 ? "var(--good)" : "var(--bad)" }}>({o.roi.toFixed(o.roi >= 10 ? 0 : 1)}% after tax)</span></span>
              <span>round trip ≈ <b style={{ color: "var(--white)" }}>{fmtDurShort(o.cycleH)}</b></span>
            </div>
            <input className="ge-range" type="range" min={0} max={bkStep} step={1}
              value={step} onChange={(e) => setStep(+e.target.value)}
              disabled={bkStep === 0} aria-label="Margin — trade profit for fill speed" />
            <div className="ge-ends"><span>full margin · patient</span><span>break-even · fast fills</span></div>
            <div className="ge-hint">
              {maxStep === 0
                ? "The spread is only 1 gp wide — there is no room to price inside it."
                : bkStep === 0
                  ? "The GE tax already eats this whole spread at the touch — there is no profitable room inside it."
                  : step === 0
                    ? "Quoted at the touch — the standard flip: buy at the insta-sell price, sell at the insta-buy price, and wait your turn in the queue."
                    : <>Priced {fmtFull(step)} gp inside the spread on each side. A better price heads the GE queue, so fills speed up — at the cost of margin.
                      {step >= bkStep && bkStep < maxStep ? " This is break-even: any deeper and the tax eats the whole margin." : ""}</>}
            </div>
          </div>

          {/* quantity */}
          <div className="ge-qtyrow">
            <label htmlFor="ge-qty">Quantity</label>
            <input id="ge-qty" className="ge-in" type="number" min={1} max={it.limit} value={qty}
              onChange={(e) => setQty(clamp(Math.round(+e.target.value || 1), 1, it.limit))} />
            <span className="cap">of the {it.limit.toLocaleString()} you can buy per 4 hours</span>
          </div>

          {/* summary */}
          <div className="ge-sumrow ge-inset">
            <div><span>You lay out</span><b>{fmtGp(o.cost)} gp</b></div>
            <div><span>Back after tax</span><b>{fmtGp(o.back)} gp</b></div>
            <div><span>Profit</span><b className={o.profit > 0 ? "good" : "bad"}>{o.profit > 0 ? "+" : ""}{fmtGp(o.profit)} gp</b></div>
            <div><span>Round trip</span><b className="gold">{fmtDurShort(o.cycleH)}</b></div>
          </div>

          {it.unconf && (
            <p className="ge-note caution">
              ⚠ The current spread is much wider than this item traded over the last hour — likely one outlier
              or bait print rather than a margin you can capture. Probe with 1 before committing the stack.
            </p>
          )}
          {status === "snapshot" && (
            <p className="ge-note caution">⚠ Offline snapshot prices — check the live tape before placing these orders.</p>
          )}
          <p className="ge-note">
            Fill clocks assume your offer captures ~25% of the counter-flow at the touch and ~50–60% when
            priced inside the spread, at the last hour's pace. Estimates, not promises.{" "}
            <a className="ge-link" href={`https://prices.runescape.wiki/osrs/item/${it.id}`} target="_blank" rel="noreferrer">
              Price history on the wiki ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= the job board =================
   Resource-processing work priced by the market itself: buy the inputs, do the
   skilling, sell the product. Focus is the whole job — what it pays, what it
   costs to start, how long it takes, and whether you have the levels — never
   gp/hr: it's low-intensity work and your GE slots run concurrently anyway.

   "Take the market" crosses the spread on both ends (insta-buy the inputs,
   insta-sell the product): thinner pay, but the job starts and ends NOW.
   "Quote and wait" prices at the touch on both ends for the full margin,
   with fill clocks on each leg. */
const SKILL_LIST = ["Smithing", "Crafting", "Fletching", "Cooking", "Herblore"];
// seconds per action by facility — desk assumptions (banking overhead added on top)
const RATE = {
  Furnace: 3.0, Anvil: 3.0, "Cooking range": 2.4, Fire: 2.4,
  "Spinning wheel": 3.0, Loom: 4.8, "Pottery Oven": 3.0, "Potter's Wheel": 3.0,
  "Dairy churn": 3.0, "": 1.8,
};
const OVERHEAD = 1.15; // bank trips, misclicks, being human
const verbOf = (r) => {
  if (r.f === "Furnace") return "Smelt";
  if (r.f === "Anvil") return "Smith";
  if (r.f === "Cooking range" || r.f === "Fire") return "Cook";
  if (r.f === "Spinning wheel") return "Spin";
  if (r.f === "Loom") return "Weave";
  if (r.f === "Pottery Oven" || r.f === "Potter's Wheel") return "Form";
  if (r.f === "Dairy churn") return "Churn";
  return { Herblore: "Mix", Fletching: "Fletch", Cooking: "Prepare", Smithing: "Superheat" }[r.s] || "Craft";
};
const niceRound = (n) => {
  if (n <= 10) return Math.max(1, Math.round(n));
  const pow = 10 ** Math.floor(Math.log10(n));
  const m = n / pow;
  return Math.round((m < 1.5 ? 1 : m < 2.5 ? 2 : m < 3.5 ? 3 : m < 4.5 ? 4 : m < 7.5 ? 5 : 10) * pow);
};

// group recipe variants by output name index once
const RECIPES_BY_OUT = (() => {
  const m = new Map();
  for (const r of RECIPES.recipes) {
    if (!m.has(r.o)) m.set(r.o, []);
    m.get(r.o).push(r);
  }
  return m;
})();

/* the cheapest way to get one unit of `nameIdx`: buy it off the exchange, or
   craft it from parts (recursively, when crafting beats buying by >3%). */
function sourceUnit(nameIdx, mode, byName, memo, visiting) {
  if (memo.has(nameIdx)) return memo.get(nameIdx);
  const name = RECIPES.names[nameIdx];
  if (name === "Coins") {
    const plan = { cost: 1, secs: 0, buys: [], steps: [], coins: 1 };
    memo.set(nameIdx, plan);
    return plan;
  }
  const it = byName.get(name);
  const buyCost = it ? (mode === "express" ? it.high : it.low) : null;
  let best = buyCost != null
    ? { cost: buyCost, secs: 0, buys: [[nameIdx, 1]], steps: [], coins: 0 }
    : null;

  if (!visiting.has(nameIdx) && visiting.size < 3) {
    visiting.add(nameIdx);
    for (const r of RECIPES_BY_OUT.get(nameIdx) || []) {
      let cost = 0, secs = (RATE[r.f] ?? 3.0) / r.q, coins = 0, ok = true;
      const buys = new Map(), steps = new Map([[JSON.stringify(r), 1 / r.q]]);
      for (const [mi, mq] of r.m) {
        const sub = sourceUnit(mi, mode, byName, memo, visiting);
        if (!sub) { ok = false; break; }
        const per = mq / r.q;
        cost += sub.cost * per; secs += sub.secs * per; coins += sub.coins * per;
        for (const [bi, bq] of sub.buys) buys.set(bi, (buys.get(bi) || 0) + bq * per);
        for (const [sk, sc] of sub.steps) steps.set(sk, (steps.get(sk) || 0) + sc * per);
      }
      if (!ok) continue;
      // craft only when it genuinely beats the exchange (or the exchange has no price)
      if (best == null || cost < best.cost * 0.97) {
        best = { cost, secs, buys: [...buys], steps: [...steps], coins };
      }
    }
    visiting.delete(nameIdx);
  }
  memo.set(nameIdx, best);
  return best;
}

/* every job worth posting for the current mode: one card per craftable,
   tradeable output whose sale beats the cost of its parts */
function buildJobs(items, mode) {
  const byName = new Map(items.map((it) => [it.name, it]));
  const memo = new Map();
  const jobs = [];
  for (const [outIdx, variants] of RECIPES_BY_OUT) {
    const out = byName.get(RECIPES.names[outIdx]);
    if (!out) continue;
    const sellRaw = mode === "express" ? out.low : out.high;
    const sellUnit = sellRaw - geTax(sellRaw, out.id);
    let best = null;
    for (const r of variants) {
      // force the final step through THIS recipe; parts sourced their cheapest way
      let cost = 0, secs = (RATE[r.f] ?? 3.0) / r.q, coins = 0, ok = true;
      const buys = new Map(), steps = new Map([[JSON.stringify(r), 1 / r.q]]);
      const visiting = new Set([outIdx]);
      for (const [mi, mq] of r.m) {
        const sub = sourceUnit(mi, mode, byName, memo, visiting);
        if (!sub) { ok = false; break; }
        const per = mq / r.q;
        cost += sub.cost * per; secs += sub.secs * per; coins += sub.coins * per;
        for (const [bi, bq] of sub.buys) buys.set(bi, (buys.get(bi) || 0) + bq * per);
        for (const [sk, sc] of sub.steps) steps.set(sk, (steps.get(sk) || 0) + sc * per);
      }
      if (!ok) continue;
      const profitUnit = sellUnit - cost;
      if (best == null || profitUnit > best.profitUnit) {
        best = { r, cost, secs: secs * OVERHEAD, coins, buys, steps, profitUnit };
      }
    }
    if (!best || best.profitUnit <= 0) continue;

    // requirements across every step — listed in work order, raw materials first
    const levels = new Map(); const facilities = new Set(); let members = out.members;
    const stepList = [...best.steps].reverse().map(([sk, perUnit]) => ({ r: JSON.parse(sk), perUnit }));
    for (const s of stepList) {
      levels.set(s.r.s, Math.max(levels.get(s.r.s) || 0, s.r.l));
      if (s.r.f) facilities.add(s.r.f);
    }
    const buyList = [...best.buys].map(([bi, perUnit]) => ({ it: byName.get(RECIPES.names[bi]), perUnit }));
    if (buyList.some((b) => !b.it)) continue;
    for (const b of buyList) if (b.it.members) members = true;

    // how many units the market and the 4h limits can actually take
    const caps = [];
    for (const b of buyList) {
      caps.push(Math.floor(b.it.limit / b.perUnit)); // rolling 4h buy limit
      caps.push(mode === "express"
        ? Math.floor((0.10 * b.it.dv) / b.perUnit)          // don't move the book
        : Math.floor((b.it.hvLo * SHARE_TOUCH * 4) / b.perUnit)); // ~4h of patient fills
    }
    caps.push(mode === "express" ? Math.floor(0.10 * out.dv) : Math.floor(out.hvHi * SHARE_TOUCH * 4));
    const maxN = Math.max(0, Math.min(...caps));
    if (maxN < 1) continue;

    jobs.push({
      key: outIdx + ":" + mode, out, mode, ...best,
      sellUnit, stepList, buyList, maxN, members,
      levels: [...levels].map(([s, l]) => ({ s, l })),
      facilities: [...facilities],
      defaultN: Math.min(niceRound(450 / best.secs), maxN),
    });
  }
  jobs.sort((a, b) => b.profitUnit * b.defaultN - a.profitUnit * a.defaultN);
  return jobs;
}

/* one job posting */
function JobCard({ job, n, setN, sheet }) {
  const { out, mode } = job;
  const clockH = (units, flow) => (flow > 0 ? Math.max(units / (flow * SHARE_TOUCH), 1 / 60) : Infinity);
  const workH = (n * job.secs) / 3600;
  const buyClock = mode === "patient" ? Math.max(0, ...job.buyList.map((b) => clockH(b.perUnit * n, b.it.hvLo))) : 0;
  const sellClock = mode === "patient" ? clockH(n, out.hvHi) : 0;
  const totalH = workH + buyClock + sellClock + 2 / 60;
  const cost = Math.round(n * job.cost);
  const profit = Math.round(n * job.profitUnit);
  const lvlChip = (q) => {
    const have = sheet.skills[q.s];
    const cls = have === "" || have == null ? "unk" : +have >= q.l ? "ok" : "no";
    return <span key={q.s} className={"ge-req " + cls}>{q.s} {q.l}{cls === "ok" ? " ✓" : cls === "no" ? " ✗" : ""}</span>;
  };
  const capNote = n >= job.maxN
    ? (mode === "express" ? "capped — a bigger batch would move these books" : "capped — the books can't fill more inside ~4h")
    : null;
  return (
    <section className="ge-panel ge-job">
      <div className="ge-jobhead">
        <h3>{verbOf(job.r)} {fmtFull(n)}× {out.name}</h3>
        <span className={"ge-pay " + (profit > 0 ? "good" : "bad")}>{profit > 0 ? "+" : ""}{fmtGp(profit)} gp</span>
      </div>
      <div className="ge-jobmeta">
        {job.levels.map(lvlChip)}
        {job.facilities.map((f) => <span key={f} className="ge-req unk">{f}</span>)}
        {job.members && <span className="ge-mem">P2P</span>}
        <span>margin {fmtFull(Math.round(job.profitUnit))} gp per item</span>
      </div>
      <div className="ge-joblines ge-inset">
        {job.buyList.map((b) => {
          const q = Math.ceil(b.perUnit * n);
          const unit = mode === "express" ? b.it.high : b.it.low;
          return (
            <div key={b.it.id}>
              <span className="op buy">BUY</span>
              {fmtFull(q)}× {b.it.name} @ {fmtFull(unit)} — {fmtGp(q * unit)} gp
              {mode === "patient" && <span className="clock"> · fills ≈ {fmtDurShort(clockH(q, b.it.hvLo))}</span>}
            </div>
          );
        })}
        {job.coins > 0 && (
          <div><span className="op buy">PAY</span>{fmtGp(Math.round(job.coins * n))} gp in fees</div>
        )}
        {job.stepList.map((s, i) => {
          const count = Math.ceil(s.perUnit * n);
          return (
            <div key={i}>
              <span className="op work">{verbOf(s.r).toUpperCase()}</span>
              {fmtFull(count)}× {RECIPES.names[s.r.o]}{s.r.f ? ` at ${s.r.f.toLowerCase()}` : ""}
              <span className="clock"> · ≈ {fmtDurShort((count * (RATE[s.r.f] ?? 3.0) * OVERHEAD) / 3600)}</span>
            </div>
          );
        })}
        <div>
          <span className="op sell">SELL</span>
          {fmtFull(n)}× {out.name} @ {fmtFull(mode === "express" ? out.low : out.high)}
          {geTax(mode === "express" ? out.low : out.high, out.id) > 0 ? " less tax" : ""} — {fmtGp(Math.round(n * job.sellUnit))} gp
          {mode === "patient" && <span className="clock"> · fills ≈ {fmtDurShort(sellClock)}</span>}
        </div>
      </div>
      <div className="ge-jobsum">
        <div className="facts">
          <div><span>You lay out</span><b>{fmtGp(cost)} gp</b></div>
          <div><span>The job pays</span><b className={profit > 0 ? "good" : "bad"}>{profit > 0 ? "+" : ""}{fmtGp(profit)} gp</b></div>
          <div><span>Return</span><b>{cost > 0 ? ((profit / cost) * 100).toFixed(1) : "–"}%</b></div>
          <div><span>Takes about</span><b className="gold">{fmtDurShort(totalH)}</b></div>
        </div>
        <div className="ge-batch">
          <button className="ge-btn" onClick={() => setN(Math.max(1, niceRound(n / 2)))} aria-label="Halve batch">−</button>
          <b>{fmtFull(n)}</b>
          <button className="ge-btn" onClick={() => setN(Math.min(job.maxN, niceRound(n * 2)))} aria-label="Double batch">+</button>
          <button className="ge-btn" onClick={() => setN(job.maxN)}>Max</button>
        </div>
      </div>
      {capNote && <p className="ge-note caution" style={{ padding: "0 13px 10px", margin: 0 }}>⚠ {capNote}.</p>}
    </section>
  );
}

function JobBoard({ items, status }) {
  const [mode, setMode] = useState("express");
  const [search, setSearch] = useState("");
  const [hideCant, setHideCant] = useState(true);
  const [batches, setBatches] = useState({}); // job key -> chosen n
  const [sheet, setSheet] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fd-sheet-v1")) || { members: true, skills: {} }; }
    catch (e) { return { members: true, skills: {} }; }
  });
  useEffect(() => { try { localStorage.setItem("fd-sheet-v1", JSON.stringify(sheet)); } catch (e) {} }, [sheet]);

  const jobs = useMemo(() => buildJobs(items, mode), [items, mode]);

  const canDo = (job) => {
    if (job.members && !sheet.members) return false;
    for (const q of job.levels) {
      const have = sheet.skills[q.s];
      if (have !== "" && have != null && +have < q.l) return false;
    }
    return true;
  };
  const q = search.trim().toLowerCase();
  const shown = jobs
    .filter((j) => (!hideCant || canDo(j)) && (!q || j.out.name.toLowerCase().includes(q)))
    .slice(0, 30);

  return (
    <>
      <section className="ge-panel">
        <div className="ge-modebar" style={{ marginBottom: 10 }}>
          <button className={"ge-btn ge-mode" + (mode === "express" ? " on" : "")} onClick={() => setMode("express")}>
            Take the market — start now
          </button>
          <button className={"ge-btn ge-mode" + (mode === "patient" ? " on" : "")} onClick={() => setMode("patient")}>
            Quote &amp; wait — full margin
          </button>
          <span className="ge-read" style={{ margin: 0 }}>
            {mode === "express"
              ? "Prices cross the spread on both ends: thinner pay, but every leg fills at once."
              : "Prices quote at the touch on both ends: the full margin, with a wait on each leg."}
          </span>
        </div>
        <div className="ge-filters">
          <div className="grow">
            <input className="ge-in" placeholder="Search the job board… e.g. keel, bar, pie" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Search jobs" />
          </div>
          <label className="ge-tog"><input type="checkbox" checked={hideCant} onChange={(e) => setHideCant(e.target.checked)} />only jobs I can start</label>
        </div>
        <div className="ge-sheet" style={{ marginTop: 10 }}>
          <span style={{ color: "var(--orange)", textShadow: "1px 1px 0 #000" }}>Your levels:</span>
          {SKILL_LIST.map((s) => (
            <label key={s} className="sk">{s}
              <input className="ge-in" type="number" min={1} max={99} placeholder="–"
                value={sheet.skills[s] ?? ""}
                onChange={(e) => setSheet((sh) => ({ ...sh, skills: { ...sh.skills, [s]: e.target.value } }))} />
            </label>
          ))}
          <label className="ge-tog"><input type="checkbox" checked={sheet.members}
            onChange={(e) => setSheet((sh) => ({ ...sh, members: e.target.checked }))} />members</label>
        </div>
      </section>

      {status === "snapshot" && (
        <p className="ge-read">Offline snapshot — the job board only sees the {items.length} baked items, so most work is hidden until the live feed returns.</p>
      )}
      <p className="ge-read">
        <b>{jobs.length}</b> jobs pay on the exchange right now{shown.length < jobs.length ? <> · showing {shown.length}</> : null}.
        Blank levels are not filtered — fill in your stats and the board tailors itself.
      </p>

      {shown.map((job) => (
        <JobCard key={job.key} job={job} sheet={sheet}
          n={clamp(batches[job.key] ?? job.defaultN, 1, job.maxN)}
          setN={(v) => setBatches((b) => ({ ...b, [job.key]: clamp(v, 1, job.maxN) }))} />
      ))}
      {shown.length === 0 && (
        <section className="ge-panel"><p className="ge-read" style={{ margin: 0 }}>
          No paying jobs match. {mode === "express"
            ? "Taking the market eats both spreads — try Quote & wait for the full margins."
            : "Loosen the search, or check back when the books move."}
        </p></section>
      )}

      <p className="ge-foot">
        Default batches are sized to roughly 5–10 minutes of work and capped by 4-hour buy limits and what the
        books can absorb (≈10% of daily volume when taking the market; ≈4 hours of patient fills when quoting).<br />
        Action speeds are desk assumptions per facility, +15% for banking. The market moves while you work — the
        pay is an estimate, not a contract.
      </p>
    </>
  );
}

/* ================= filters ================= */
const BANDS = [
  { k: "any", label: "Any price", lo: 0, hi: Infinity },
  { k: "p1", label: "Under 100 gp", lo: 0, hi: 100 },
  { k: "p2", label: "100 gp – 10k", lo: 100, hi: 10_000 },
  { k: "p3", label: "10k – 1m", lo: 10_000, hi: 1_000_000 },
  { k: "p4", label: "Over 1m", lo: 1_000_000, hi: Infinity },
];
const VOLS = [
  { k: "any", label: "Any volume", min: 0 },
  { k: "v1", label: "10k+ traded/day", min: 10_000 },
  { k: "v2", label: "100k+ traded/day", min: 100_000 },
  { k: "v3", label: "1m+ traded/day", min: 1_000_000 },
];

/* ================= app ================= */
export default function FlipDesk() {
  const [status, setStatus] = useState("loading"); // loading | live | snapshot
  const [live, setLive] = useState(null);          // {items, universe} | null
  const [updatedAt, setUpdatedAt] = useState(null);
  const [, setTick] = useState(0);                 // periodic re-render for the age chip

  const [search, setSearch] = useState("");
  const [band, setBand] = useState("any");
  const [minVol, setMinVol] = useState("any");
  const [f2pOnly, setF2pOnly] = useState(false);
  const [profOnly, setProfOnly] = useState(false);
  const [sortKey, setSortKey] = useState("dv");
  const [sortDir, setSortDir] = useState(-1);
  const [selId, setSelId] = useState(null);
  const [view, setView] = useState("market"); // market | jobs

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

  const assessed = useMemo(() => (live?.items ?? BASE_ITEMS).map(assess), [live]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const b = BANDS.find((x) => x.k === band) || BANDS[0];
    const v = VOLS.find((x) => x.k === minVol) || VOLS[0];
    return assessed.filter((it) =>
      it.low >= b.lo && it.low < b.hi &&
      it.dv >= v.min &&
      (!f2pOnly || !it.members) &&
      (!profOnly || it.margin > 0) &&
      (!q || it.name.toLowerCase().includes(q))
    );
  }, [assessed, search, band, minVol, f2pOnly, profOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === "name" ? a.name : a[sortKey];
      const vb = sortKey === "name" ? b.name : b[sortKey];
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const clickSort = (k, dir = -1) => {
    if (sortKey === k) setSortDir((d) => -d);
    else { setSortKey(k); setSortDir(dir); }
  };
  const Th = ({ k, dir, children, cls = "" }) => (
    <th className={(sortKey === k ? "on " : "") + cls} onClick={() => clickSort(k, dir)}>
      {children}{sortKey === k && <span className="arr">{sortDir === -1 ? "▼" : "▲"}</span>}
    </th>
  );

  const sel = useMemo(() => assessed.find((p) => p.id === selId) || null, [assessed, selId]);
  const snapAgeH = Math.round((Date.now() / 1000 - SNAPSHOT.ts) / 3600);
  const snapAgeStr = snapAgeH > 48 ? `~${Math.round(snapAgeH / 24)} days old` : `~${snapAgeH}h old`;
  const SHOW = 400;

  return (
    <div className="ge-root">
      <style>{CSS}</style>
      <div className="ge-wrap">

        {/* masthead */}
        <header className="ge-mast">
          <div>
            <h1 className="ge-title">Grand Exchange</h1>
            <p className="ge-sub">The market as it stands</p>
          </div>
          <div className="ge-status">
            {status === "live" && (
              <span className="ge-chip live"><i className="ge-dot" />LIVE · {updatedAt ? agoStr((Date.now() - updatedAt.getTime()) / 60000).replace(" ago", "").toUpperCase() : ""}</span>
            )}
            {status === "snapshot" && <span className="ge-chip snap">◈ SNAPSHOT · {SNAP_DATE.toLocaleDateString([], { day: "numeric", month: "short" })}</span>}
            {status === "loading" && <span className="ge-chip load">… polling exchange</span>}
            <button className="ge-btn" onClick={() => refresh(false)} disabled={status === "loading"}>↻ Refresh</button>
          </div>
        </header>
        <hr className="ge-rule" />

        {/* tabs */}
        <div className="ge-tabs" role="tablist">
          <button className={"ge-tab" + (view === "market" ? " on" : "")} role="tab"
            aria-selected={view === "market"} onClick={() => setView("market")}>Market Board</button>
          <button className={"ge-tab" + (view === "jobs" ? " on" : "")} role="tab"
            aria-selected={view === "jobs"} onClick={() => setView("jobs")}>Job Board</button>
        </div>

        {status === "snapshot" && (
          <div className="ge-warn" role="alert">
            <b>Live feed unreachable.</b> Showing the baked snapshot from{" "}
            {SNAP_DATE.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {snapAgeH > 1 ? ` (${snapAgeStr})` : ""} — prices drift by the minute, so treat these as a teaching tape.
          </div>
        )}

        {view === "jobs" && <JobBoard items={assessed} status={status} />}

        {view === "market" && <>
        <p className="ge-read">
          <b>{assessed.length.toLocaleString()}</b> items on the exchange
          {filtered.length !== assessed.length && <> · <b>{filtered.length.toLocaleString()}</b> match your filters</>}
          {" "}· tap an item for its recommended flip.
        </p>

        {/* filters */}
        <section className="ge-panel">
          <div className="ge-filters">
            <div className="grow">
              <input className="ge-in" placeholder="Search the exchange… e.g. rune, shark, whip" value={search}
                onChange={(e) => setSearch(e.target.value)} aria-label="Search items" />
            </div>
            <select className="ge-sel" value={band} onChange={(e) => setBand(e.target.value)} aria-label="Price bracket">
              {BANDS.map((b) => <option key={b.k} value={b.k}>{b.label}</option>)}
            </select>
            <select className="ge-sel" value={minVol} onChange={(e) => setMinVol(e.target.value)} aria-label="Minimum daily volume">
              {VOLS.map((v) => <option key={v.k} value={v.k}>{v.label}</option>)}
            </select>
            <label className="ge-tog"><input type="checkbox" checked={f2pOnly} onChange={(e) => setF2pOnly(e.target.checked)} />F2P only</label>
            <label className="ge-tog"><input type="checkbox" checked={profOnly} onChange={(e) => setProfOnly(e.target.checked)} />in profit</label>
          </div>
        </section>

        {/* the board */}
        <div className="ge-tablewrap ge-inset">
          <table className="ge-t">
            <thead>
              <tr>
                <Th k="name" dir={1}>Item</Th>
                <Th k="low">Buy</Th>
                <Th k="high" cls="hide-sm">Sell</Th>
                <Th k="margin">Margin</Th>
                <Th k="roi">ROI</Th>
                <Th k="dv" cls="hide-xs">Traded/day</Th>
                <Th k="limit" cls="hide-sm">Limit/4h</Th>
                <Th k="flipH" dir={1} cls="hide-sm">Flip a limit</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, SHOW).map((it) => (
                <tr key={it.id} tabIndex={0}
                  onClick={() => setSelId(it.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(it.id); } }}>
                  <td>
                    <span className="nm">{it.name}</span>
                    {it.members && <span className="ge-mem">P2P</span>}
                    {it.unconf && <span className="ge-flag" title="Spread is far wider than the last hour's average — likely one outlier print.">?</span>}
                  </td>
                  <td className="gold">{fmtGp(it.low)}</td>
                  <td className="gold hide-sm">{fmtGp(it.high)}</td>
                  <td className={it.margin > 0 ? "good" : it.margin < 0 ? "bad" : "mut"}>{fmtGp(it.margin)}</td>
                  <td className={it.margin > 0 ? "good" : it.margin < 0 ? "bad" : "mut"}>{it.roi.toFixed(1)}%</td>
                  <td className="mut hide-xs">{fmtQty(it.dv)}</td>
                  <td className="mut hide-sm">{fmtQty(it.limit)}</td>
                  <td className={"hide-sm " + durClass(it.flipH)}>{fmtDurShort(it.flipH)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="ge-more">Nothing on the exchange matches — loosen the filters.</div>}
          {sorted.length > SHOW && <div className="ge-more">Showing the top {SHOW} of {sorted.length.toLocaleString()} — search or filter to narrow the board.</div>}
        </div>

        <p className="ge-foot">
          Buy = highest insta-sell price · Sell = lowest insta-buy price · Margin is per item after GE tax
          (2% of sale, capped at 5m; under 50 gp and bonds exempt).<br />
          Live prices courtesy of the <a className="ge-link" href="https://prices.runescape.wiki" target="_blank" rel="noreferrer">OSRS Wiki price API</a> — estimates, not promises.
        </p>
        </>}
      </div>

      {sel && <ItemPopup key={sel.id} it={sel} status={status} onClose={() => setSelId(null)} />}
    </div>
  );
}
