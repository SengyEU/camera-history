import { writeFileSync } from "node:fs";

const RATE = 250;
const DEV_HOURS = 100;
const DOMAIN = 300;
const INITIAL = DEV_HOURS * RATE + DOMAIN;

const EUR_CZK = 25;
const AVG_PACKAGE_EUR = 13.99;
const PACKAGE_REVENUE = AVG_PACKAGE_EUR * EUR_CZK;
const STRIPE = AVG_PACKAGE_EUR * 0.045 * EUR_CZK;
const STORAGE = 3 * 0.5;
const VARIABLE = STRIPE + STORAGE;
const CONTRIBUTION = PACKAGE_REVENUE - VARIABLE;

const FIXED = 550;
const TIME_HOURS = 15;
const TIME = TIME_HOURS * RATE;
const CAMERAS_PER_CUSTOMER = 3;

const PACKAGES = [
  { name: "Solo", cameras: 1, eur: 7.99 },
  { name: "Starter", cameras: 3, eur: 13.99 },
  { name: "Plus", cameras: 5, eur: 19.99 },
  { name: "Pro", cameras: 10, eur: 29.99 },
  { name: "Network", cameras: 25, eur: 49.99 },
];

const customersByMonth = {
  1: 0,
  2: 0,
  3: 3,
  4: 5,
  5: 8,
  6: 10,
  7: 15,
  8: 20,
  9: 25,
  10: 33,
  11: 40,
  12: 50,
};

const months = [];
for (let month = 1; month <= 12; month += 1) {
  const customers = customersByMonth[month];
  const cameras = customers * CAMERAS_PER_CUSTOMER;
  const revenue = customers * PACKAGE_REVENUE;
  const variable = customers * VARIABLE;
  const cashProfit = revenue - variable - FIXED;
  months.push({
    month,
    customers,
    cameras,
    revenue,
    variable,
    cashProfit,
    fullProfit: cashProfit - TIME,
  });
}

const revenueYear = months.reduce((sum, month) => sum + month.revenue, 0);
const steadyCash = 50 * CONTRIBUTION - FIXED;
const steadyFull = steadyCash - TIME;
const breakEvenFull = Math.ceil((FIXED + TIME) / CONTRIBUTION);

let running = -INITIAL;
const balance = [{ label: "12/26", value: running }];
for (const month of months) {
  running += month.fullProfit;
  balance.push({ label: `${String(month.month).padStart(2, "0")}/27`, value: running });
}
for (let month = 1; month <= 6; month += 1) {
  running += steadyFull;
  balance.push({ label: `${String(month).padStart(2, "0")}/28`, value: running });
}

const paybackIndex = balance.findIndex((point) => point.value >= 0);
const monthNames = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];
const monthLocative = [
  "lednu",
  "únoru",
  "březnu",
  "dubnu",
  "květnu",
  "červnu",
  "červenci",
  "srpnu",
  "září",
  "říjnu",
  "listopadu",
  "prosinci",
];
const [paybackMonth, paybackYear] = balance[paybackIndex].label.split("/");
const paybackNom = `${monthNames[Number(paybackMonth) - 1]} 20${paybackYear}`;
const paybackTitle = paybackNom.charAt(0).toUpperCase() + paybackNom.slice(1);

let cashRunning = -INITIAL;
let cashPaybackLoc = "";
for (const month of months) {
  cashRunning += month.cashProfit;
  if (cashRunning >= 0) {
    cashPaybackLoc = `${monthLocative[month.month - 1]} 2027`;
    break;
  }
}

const nbsp = (value) => value.replace(/\u00a0/g, " ");
const kc = (value) => {
  const sign = value < 0 ? "−" : "";
  return `${sign}${nbsp(Math.round(Math.abs(value)).toLocaleString("cs-CZ"))} Kč`;
};
const kc2 = (value) => {
  const sign = value < 0 ? "−" : "";
  return `${sign}${nbsp(
    Math.abs(value).toLocaleString("cs-CZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  )} Kč`;
};
const eur = (value) =>
  `${value.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const num = (value, digits = 1) =>
  nbsp(
    value.toLocaleString("cs-CZ", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  );

// ---- chart -------------------------------------------------------------
const W = 660;
const H = 220;
const PAD = { left: 46, right: 12, top: 16, bottom: 28 };
const min = -50000;
const max = 75000;
const x = (index) => PAD.left + (index / (balance.length - 1)) * (W - PAD.left - PAD.right);
const y = (value) => PAD.top + ((max - value) / (max - min)) * (H - PAD.top - PAD.bottom);
const line = balance
  .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
  .join(" ");
const ticks = [-50000, -25000, 0, 25000, 50000, 75000];
const tickLabels = {
  [-50000]: "−50",
  [-25000]: "−25",
  0: "0",
  25000: "+25",
  50000: "+50",
  75000: "+75",
};
const xTicks = [0, 3, 6, 9, 12, 15, 18];

const chart = `
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kumulativní bilance projektu">
  <text x="0" y="10" font-size="8" fill="#5b6b7c">tis. Kč</text>
  <g font-size="8.5" fill="#5b6b7c">
    ${ticks
      .map(
        (tick) =>
          `<line x1="${PAD.left}" y1="${y(tick).toFixed(1)}" x2="${W - PAD.right}" y2="${y(tick).toFixed(1)}" stroke="${tick === 0 ? "#101828" : "#e3e9ef"}" stroke-width="${tick === 0 ? 1 : 0.8}" />` +
          `<text x="${PAD.left - 8}" y="${(y(tick) + 3).toFixed(1)}" text-anchor="end">${tickLabels[tick]}</text>`,
      )
      .join("")}
    ${xTicks
      .map(
        (index) =>
          `<text x="${x(index).toFixed(1)}" y="${H - 8}" text-anchor="middle">${balance[index].label}</text>`,
      )
      .join("")}
  </g>
  <path d="${line}" fill="none" stroke="#0e7490" stroke-width="2.2" stroke-linejoin="round" />
  <circle cx="${x(paybackIndex).toFixed(1)}" cy="${y(balance[paybackIndex].value).toFixed(1)}" r="3.6" fill="#15803d" />
  <text x="${(x(paybackIndex) - 8).toFixed(1)}" y="${(y(balance[paybackIndex].value) - 7).toFixed(1)}" text-anchor="end" font-size="8.5" font-weight="600" fill="#15803d">návratnost: ${paybackNom}</text>
</svg>`;

// ---- tables ------------------------------------------------------------
const money = (value) => `<td class="num">${kc(value)}</td>`;
const monthRows = months
  .filter((month) => month.customers > 0)
  .map(
    (month) => `<tr>
      <td>${monthNames[month.month - 1]}</td>
      <td class="num">${month.customers}</td>
      <td class="num">${num(month.cameras, 0)}</td>
      ${money(month.revenue)}
    </tr>`,
  )
  .join("");

const packageRows = PACKAGES.map(
  (pkg) => `<tr>
    <td>${pkg.name}</td>
    <td class="num">${pkg.cameras}</td>
    <td class="num">${eur(pkg.eur)}</td>
    <td class="num">${kc2(pkg.eur * EUR_CZK)}</td>
  </tr>`,
).join("");

const html = `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<title>Finanční rozvaha - Camera History</title>
<style>
  @font-face {
    font-family: "Montserrat";
    src: url("../node_modules/@fontsource-variable/montserrat/files/montserrat-latin-ext-wght-normal.woff2") format("woff2");
    font-weight: 100 900;
    font-display: block;
  }
  @page { size: A4; margin: 14mm 17mm 13mm; }
  :root {
    --ink: #101828;
    --muted: #5b6b7c;
    --line: #e3e9ef;
    --glacier: #0e7490;
  }
  * { box-sizing: border-box; }
  html { font-family: "Montserrat", ui-sans-serif, system-ui, sans-serif; color: var(--ink); }
  body { margin: 0; background: #fff; font-size: 9.5pt; line-height: 1.4; }

  .keep { break-inside: avoid; }
  .doc-title { margin: 0 0 8mm; font-size: 23pt; line-height: 1.1; letter-spacing: -0.03em; }

  .key { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0 0 7mm; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .key div { padding: 4mm 4mm 4mm 0; }
  .key div + div { padding-left: 4mm; border-left: 1px solid var(--line); }
  .key span { display: block; color: var(--muted); font-size: 7.4pt; letter-spacing: 0.06em; text-transform: uppercase; }
  .key strong { display: block; margin-top: 1.4mm; font-size: 16pt; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; }

  h2 { margin: 6mm 0 2.2mm; font-size: 12.5pt; letter-spacing: -0.01em; break-after: avoid-page; }
  h2 .n { color: var(--glacier); font-weight: 600; margin-right: 2mm; }
  p { margin: 0 0 2mm; max-width: 88ch; }

  table { width: 100%; border-collapse: collapse; font-size: 8.8pt; break-inside: avoid; }
  tr { break-inside: avoid; }
  th { padding: 1mm 2mm 1mm 0; border-bottom: 1px solid var(--ink); font-size: 7.4pt; letter-spacing: 0.06em; text-transform: uppercase; text-align: left; font-weight: 600; }
  td { padding: 0.75mm 2mm 0.75mm 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .num { text-align: right; padding-right: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { border-top: 1px solid var(--ink); border-bottom: none; font-weight: 600; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 9mm; }

  .note { margin-top: 2mm; color: var(--muted); font-size: 8pt; max-width: 88ch; }
  .table-gap { height: 4mm; }

  .beat { margin: 1mm 0 0; font-size: 23pt; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; }
  .beat-note { margin-top: 2mm; max-width: 82ch; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin: 4mm 0 0; padding-top: 3mm; border-top: 1px solid var(--line); }
  .facts strong { display: block; font-size: 13pt; letter-spacing: -0.02em; }
  .facts span { display: block; margin-top: 1mm; color: var(--muted); font-size: 8pt; }
  .chart { margin-top: 4mm; padding-top: 3mm; border-top: 1px solid var(--line); break-inside: avoid; }
  .chart svg { width: 100%; height: auto; }

  .big-table td { padding: 2.1mm 2mm 2.1mm 0; font-size: 10pt; }
  .big-table th { font-size: 7.8pt; }
</style>
</head>
<body>

<h1 class="doc-title">Finanční rozvaha - Camera History</h1>

<div class="key">
  <div><span>Počáteční investice</span><strong>${kc(INITIAL)}</strong></div>
  <div><span>Měsíční náklady</span><strong>${kc(FIXED + TIME)}</strong></div>
  <div><span>Bod zvratu</span><strong>${paybackNom}</strong></div>
</div>

<h2><span class="n">A</span>Vývojová fáze</h2>
<table>
  <tr><td>Vývoj</td><td class="num">100 h × 250 Kč/h</td>${money(DEV_HOURS * RATE)}</tr>
  <tr><td>Doména na rok</td><td class="num"></td>${money(DOMAIN)}</tr>
  <tr class="total"><td>Celková počáteční investice</td><td class="num"></td>${money(INITIAL)}</tr>
</table>

<h2><span class="n">B</span>Provozní náklady</h2>
<div class="cols">
  <div>
    <table>
      <thead><tr><th>Variabilní na 1 zákazníka (Starter balíček)</th><th></th></tr></thead>
      <tbody>
        <tr><td>Stripe 4,5 % z balíčku</td><td class="num">${kc2(STRIPE)}</td></tr>
        <tr><td>Úložiště 3 kamery</td><td class="num">${kc2(STORAGE)}</td></tr>
        <tr class="total"><td>Celkem</td><td class="num">${kc2(VARIABLE)}</td></tr>
      </tbody>
    </table>
  </div>
  <div>
    <table>
      <thead><tr><th>Fixní měsíčně</th><th></th></tr></thead>
      <tbody>
        <tr><td>Hosting</td>${money(300)}</tr>
        <tr><td>AI nástroje</td>${money(250)}</tr>
        <tr><td>Vlastní čas 15 h</td>${money(TIME)}</tr>
        <tr class="total"><td>Celkem</td>${money(FIXED + TIME)}</tr>
      </tbody>
    </table>
  </div>
</div>

<h2><span class="n">C</span>Balíčky a prodejní plán</h2>
<p>Všechny balíčky zahrnují 12 měsíců historie. Cena je měsíční, včetně DPH.</p>
<table>
  <thead><tr><th>Balíček</th><th class="num">Kamer</th><th class="num">EUR / měsíc</th><th class="num">Kč / měsíc</th></tr></thead>
  <tbody>${packageRows}</tbody>
</table>
<div class="table-gap" style="height:3mm"></div>
<table>
  <thead><tr><th>Měsíc 2027</th><th class="num">Zákazníci</th><th class="num">Kamery</th><th class="num">Tržby</th></tr></thead>
  <tbody>${monthRows}</tbody>
</table>

<section class="keep">
  <h2><span class="n">D</span>Bod zvratu a návratnost</h2>
  <p class="beat">${paybackTitle}</p>
  <p class="beat-note">V tento měsíc kumulativní tržby poprvé pokryjí počáteční investici ${kc(INITIAL)}, měsíční provoz i 15 h měsíčně na vlastní práci. Bez započtení vlastního času by to bylo v ${cashPaybackLoc}.</p>
  <div class="facts">
    <div><strong>${breakEvenFull} zákazníků</strong><span>pokryje měsíční náklady včetně času</span></div>
    <div><strong>${kc(steadyFull)}</strong><span>měsíční zisk při 50 zákaznících</span></div>
  </div>
  <div class="chart">${chart}</div>

  <h2><span class="n">E</span>Měsíční výkaz zisku a ztráty</h2>
  <p class="note">Modelový měsíc při 50 zákaznících, tj. 150 kamer (3 na zákazníka).</p>
  <table class="big-table">
    <thead><tr><th>Položka</th><th class="num">Kč</th></tr></thead>
    <tbody>
      <tr><td>Tržby z prodeje (50 × 349,75)</td>${money(50 * PACKAGE_REVENUE)}</tr>
      <tr><td>Variabilní náklady (50 × ${kc2(VARIABLE)})</td>${money(-50 * VARIABLE)}</tr>
      <tr class="total"><td>Hrubý zisk</td>${money(50 * CONTRIBUTION)}</tr>
      <tr><td>Měsíční fixní náklady</td>${money(-FIXED)}</tr>
      <tr><td>Vlastní čas 15 h × 250 Kč</td>${money(-TIME)}</tr>
      <tr class="total"><td>Čistý zisk za měsíc</td>${money(steadyFull)}</tr>
    </tbody>
  </table>
  <p class="beat-note" style="margin-top:5mm">Při 50 zákaznících vydělá projekt ${kc(steadyCash)} měsíčně před započtením času. Z toho ${kc(TIME)} je zaplacený vlastní čas a ${kc(steadyFull)} zisk nad jeho rámec.</p>
</section>

</body>
</html>`;

writeFileSync("/home/ubuntu/camera-history/docs/finance-plan.html", html);
console.log({
  initial: INITIAL,
  packageRevenue: PACKAGE_REVENUE,
  variable: VARIABLE,
  contribution: CONTRIBUTION,
  revenueYear,
  steadyCash,
  steadyFull,
  breakEvenFull,
  payback: balance[paybackIndex]?.label,
  cashPayback: cashPaybackLoc,
  trough: Math.min(...balance.map((p) => p.value)),
  balanceEnd: balance.at(-1),
});
