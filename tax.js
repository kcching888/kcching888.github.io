/* =========================================================
   CRA Tax Reporting — Annual Realized Capital Gains
   ========================================================= */

const GAS_URL = localStorage.getItem('ibkr_gas_url');

let taxData = {
  allTrades: [],
  transfers: [],
  hsbcStatements: []
};

const els = {
  year: document.getElementById('f-cra-year'),
  source: document.getElementById('f-cra-source'),
  account: document.getElementById('f-cra-account'),
  status: document.getElementById('cra-status'),
  tbody: document.querySelector('#cra-gains-table tbody'),
  proceeds: document.getElementById('sum-proceeds'),
  acb: document.getElementById('sum-acb'),
  gain: document.getElementById('sum-gain'),
  taxable: document.getElementById('sum-taxable'),
  refresh: document.getElementById('btn-cra-refresh'),
  export: document.getElementById('btn-cra-export')
};

/* ---------------- Utilities ---------------- */

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtCad(value) {
  return value.toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2
  });
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toISOString().slice(0, 10);
}

function setStatus(message, isError = false) {
  els.status.textContent = message || '';
  els.status.classList.toggle('error', isError);
}

function getTradeDate(t) {
  return t.date || t.tradeDate || t.dateTime || t.timestamp || '';
}

function getTradeSource(t) {
  const source = String(t.source || '').trim().toUpperCase();

  if (source === 'IBKR') return 'IBKR';
  if (source === 'HSBC') return 'HSBC';

  return 'UNKNOWN';
}

function getSymbol(t) {
  return String(
    t.symbol || t.ticker || t.security || t.securityId || ''
  ).trim().toUpperCase();
}

function getQuantity(t) {
  return num(
    t.quantity ??
    t.qty ??
    t.shares ??
    t.units ??
    0
  );
}

function getTradeType(t) {
  return String(
    t.action ||
    t.tradeAction ||
    t.type ||
    t.transactionType ||
    t.side ||
    ''
  ).trim();
}

function isBuy(t) {
  const action = getTradeType(t).toUpperCase();
  const qty = num(t.quantity ?? t.qty ?? t.shares ?? 0);

  return (
    action === 'BUY' ||
    action === 'BOUGHT' ||
    action === 'B' ||
    action.includes('BUY') ||
    action.includes('PURCHASE') ||
    (qty > 0 &&
      !action.includes('SELL') &&
      !action.includes('LANDING') &&
      !action.includes('CORPORATE'))
  );
}

function isSell(t) {
  const action = getTradeType(t).toUpperCase();
  const qty = num(t.quantity ?? t.qty ?? t.shares ?? 0);

  return (
    action === 'SELL' ||
    action === 'SOLD' ||
    action === 'S' ||
    action.includes('SELL') ||
    action.includes('SALE') ||
    action.includes('DISPOSITION') ||
    (qty < 0 &&
      !action.includes('BUY') &&
      !action.includes('LANDING') &&
      !action.includes('CORPORATE'))
  );
}

function isCorporateActionOut(t) {
  const type = getTradeType(t).toLowerCase();
  return type.includes('corporate action out') || type.includes('ca out');
}

function isCorporateActionIn(t) {
  const type = getTradeType(t).toLowerCase();
  return type.includes('corporate action in') || type.includes('ca in');
}

function isLanding(t) {
  const type = getTradeType(t).toLowerCase();
  return type.includes('landing');
}

/* CAD value:
   Prefer the dashboard's calculated CAD amount.
   Otherwise use amount x exchange rate. */
function getCadAmount(t) {
  if (t.cadAmount !== undefined && t.cadAmount !== null && t.cadAmount !== '') {
    return num(t.cadAmount);
  }

  const qty = Math.abs(getQuantity(t));
  const price = num(t.price ?? 0);
  const commission = num(t.commission ?? t.fee ?? 0);

  let nativeAmount = num(
    t.amount ??
    t.grossAmount ??
    t.netAmount ??
    0
  );

  if (!nativeAmount && qty && price) {
    nativeAmount = qty * price;
  }

  const fx = num(
    t.exchRate ??
    t.exchangeRate ??
    t.fxRate ??
    1
  );

  return nativeAmount * fx;
}

function getUsdAmount(t) {
  return num(
    t.amount ??
    t.grossAmount ??
    t.netAmount ??
    t.proceeds ??
    t.cost ??
    0
  );
}

function getFeesCad(t) {
  const fee = num(
    t.fee ??
    t.commission ??
    t.fees ??
    0
  );

  const feeCad = num(t.feeCad);

  if (feeCad) return Math.abs(feeCad);
  if (fee) return Math.abs(fee) * num(t.exchRate || t.exchangeRate || 1);
  return 0;
}

/* ---------------- Data loading ---------------- */

async function loadTaxData() {
  if (!GAS_URL) {
    setStatus('Configure the Google Sheets Web App URL first.', true);
    return;
  }

  setStatus('Loading investment data…');

  const url = `${GAS_URL}?action=getAll&t=${Date.now()}`;
  const res = await fetch(url);
  const json = await res.json();

  console.log('GAS getAll response keys:', Object.keys(json));
  console.log('GAS getAll response:', json);

  const data = json.data || json;

  taxData.allTrades = normalizeTrades(
    data.allTrades ||
    data.trades ||
    data.IBKRTrades ||
    data.HSBCTrades ||
    []
  );

taxData.transfers = data.transfers || [];
taxData.hsbcStatements = data.hsbcStatements || [];

console.log('Normalized trades:', taxData.allTrades.length);
console.log('Sample normalized trades:', taxData.allTrades.slice(0, 10));

// 1. Count normalized source values
const sourceCounts = {};

taxData.allTrades.forEach(t => {
  const key = t._source || '(blank)';
  sourceCounts[key] = (sourceCounts[key] || 0) + 1;
});

console.log('Source counts:', sourceCounts);

// 2. Count raw action / type values
const actionCounts = {};

taxData.allTrades.forEach(t => {
  const key = String(
    t.action ||
    t.type ||
    t.tradeAction ||
    '(blank)'
  ).trim().toUpperCase();

  actionCounts[key] = (actionCounts[key] || 0) + 1;
});

console.log('Action counts:', actionCounts);

// 3. Show a compact sample for checking field names
console.table(
  taxData.allTrades.slice(0, 15).map(t => ({
    date: t.date,
    source: t.source,
    normalizedSource: t._source,
    account: t.account,
    action: t.action,
    type: t.type,
    symbol: t.symbol,
    quantity: t.quantity,
    price: t.price,
    amount: t.amount,
    currency: t.currency
  }))
);

// 4. Count detected sells
const sells = taxData.allTrades.filter(t => isSell(t));
console.log('Detected sells:', sells.length);
console.log('Sample sells:', sells.slice(0, 10));

  const sources = [...new Set(taxData.allTrades.map(t => t._source))];
  const years = [...new Set(
    taxData.allTrades
      .map(t => new Date(t._date))
      .filter(d => !isNaN(d))
      .map(d => d.getFullYear())
  )].sort((a, b) => b - a);

  console.log('Detected sources:', sources);
  console.log('Detected years:', years);

  populateYearFilter();
  populateAccountFilter();
  setStatus(
    `Loaded ${taxData.allTrades.length.toLocaleString()} transactions; ` +
    `${sells.length.toLocaleString()} potential sales detected.`
  );

  renderCapitalGains();
}

/* Normalize field names so the tax engine is resilient
   to small differences between IBKR and HSBC records. */
function normalizeTrades(rows) {
  return rows.map((r, i) => ({
    ...r,
    _id: r.id || r.reference || r.statementKey || `row-${i}`,
    _date: getTradeDate(r),
    _source: getTradeSource(r),
    _symbol: getSymbol(r),
    _qty: getQuantity(r),
    _type: getTradeType(r),
    _cad: getCadAmount(r),
    _usd: getUsdAmount(r),
    _feesCad: getFeesCad(r)
  })).filter(r => r._symbol);
}

/* ---------------- Year filter ---------------- */

function populateYearFilter() {
  const years = new Set();

  taxData.allTrades.forEach(t => {
    const d = new Date(t._date);
    if (!isNaN(d)) years.add(d.getFullYear());
  });

  const sorted = [...years].sort((a, b) => b - a);

  els.year.innerHTML = '';

  if (!sorted.length) {
    els.year.innerHTML = '<option value="">No dates</option>';
    return;
  }

  sorted.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    els.year.appendChild(opt);
  });

  els.year.value = sorted[0];
}

/* ---------------- ACB engine ---------------- */

function buildAcbLedger(sourceFilter) {
  const ledger = new Map();

  const selectedSource = String(sourceFilter || 'All').toUpperCase();
  const selectedAccount = els.account.value || 'All';

  let rows = taxData.allTrades
    .filter(t => {
      const source = String(t._source || '').toUpperCase();

      const sourceMatches =
        selectedSource === 'ALL' ||
        source === selectedSource;

      const accountMatches =
        selectedAccount === 'All' ||
        getTradeAccount(t) === selectedAccount;

      return sourceMatches && accountMatches;
    })
    .sort((a, b) => new Date(a._date) - new Date(b._date));

// Identify opening Landing records by source + account + symbol.
// Account is included so one account's Landing does not reset another.
function holdingKey(t) {
  return JSON.stringify([
    String(t._source || '').toUpperCase(),
    getTradeAccount(t),
    t._symbol
  ]);
}

const landingByHolding = new Map();

rows.forEach(t => {
  const source = String(t._source || '').toUpperCase();

  if (source !== 'HSBC' || !isLanding(t)) return;

  const key = holdingKey(t);

  if (landingByHolding.has(key)) {
    throw new Error(
      `Multiple Landing records for ${getTradeAccount(t)} / ` +
      `${t._symbol}. Review these records before calculating ACB.`
    );
  }

  const landingTime = new Date(t._date).getTime();

  if (!Number.isFinite(landingTime)) {
    throw new Error(`Invalid Landing date for ${t._symbol}.`);
  }

  landingByHolding.set(key, {
    record: t,
    time: landingTime
  });
});

// Remove transactions before the opening Landing record.
// Retain the Landing itself and transactions on/after that date.
rows = rows.filter(t => {
  const opening = landingByHolding.get(holdingKey(t));

  if (!opening) return true;

  const time = new Date(t._date).getTime();

  if (!Number.isFinite(time)) {
    throw new Error(`Invalid transaction date for ${t._symbol}.`);
  }

  return t === opening.record || time >= opening.time;
});

// Ensure Landing is processed before other records with the same date.
rows.sort((a, b) => {
  const dateDifference =
    new Date(a._date).getTime() - new Date(b._date).getTime();

  if (dateDifference !== 0) return dateDifference;

  const aIsOpening =
    landingByHolding.get(holdingKey(a))?.record === a;

  const bIsOpening =
    landingByHolding.get(holdingKey(b))?.record === b;

  return Number(bIsOpening) - Number(aIsOpening);
});
   
  // Keep the remainder of your existing ledger function here.

  rows.forEach(t => {
    const key = holdingKey(t);

     ledger.set(key, {
  source: t._source,
  account: getTradeAccount(t),
  symbol: t._symbol,
  qty: 0,
  costCad: 0,
  sales: []
});
     
    if (!ledger.has(key)) {
      ledger.set(key, {
        source: t._source,
        symbol: t._symbol,
        qty: 0,
        costCad: 0,
        sales: []
      });
    }

    const pos = ledger.get(key);

   if (isLanding(t)) {
  const source = String(t._source || '').toUpperCase();

  // This opening-balance rule applies only to HSBC Landing records.
  if (source !== 'HSBC') return;

  const openingQty = Math.abs(t._qty);

  // Read the explicit stored CAD valuation, not _cad:
  // _cad may have been calculated using a default FX rate.
  const rawCad = t.cadAmount;

  const openingCad =
    rawCad === undefined ||
    rawCad === null ||
    String(rawCad).trim() === ''
      ? NaN
      : Number(String(rawCad).replace(/,/g, '').trim());

  if (
    !Number.isFinite(openingQty) ||
    openingQty <= 0 ||
    !Number.isFinite(openingCad) ||
    openingCad < 0
  ) {
    throw new Error(
      `Missing or invalid Landing quantity/CAD valuation: ` +
      `${getTradeAccount(t)} / ${t._symbol}`
    );
  }

  pos.qty = openingQty;
  pos.costCad = openingCad;

  // Landing establishes the opening basis, not a reported sale.
  return;
}
    if (isCorporateActionOut(t)) {
      // Split / corporate-action removal:
      // reduce share count but preserve remaining cost basis.
      pos.qty -= Math.abs(t._qty);
      return;
    }

    if (isCorporateActionIn(t)) {
      // Split / corporate-action receipt:
      // increase share count but preserve cost basis.
      pos.qty += Math.abs(t._qty);
      return;
    }

    if (isBuy(t)) {
      const buyQty = Math.abs(t._qty);
      const buyCost = Math.abs(t._cad) + t._feesCad;

      pos.qty += buyQty;
      pos.costCad += buyCost;
      return;
    }

    if (isSell(t)) {
      const sellQty = Math.abs(t._qty);

     if (pos.qty <= 0) {
  console.warn('Sale skipped: no opening quantity', {
    date: t._date,
    source: t._source,
    account: getTradeAccount(t),
    symbol: t._symbol,
    action: getTradeType(t),
    sellQty,
    positionQty: pos.qty,
    positionCostCad: pos.costCad
  });

  return;
}

      const avgCostCad = pos.costCad / pos.qty;
      const acbCad = avgCostCad * sellQty;

      const proceedsCad = Math.abs(t._cad);
      const outlaysCad = t._feesCad;

      const gainCad = proceedsCad - acbCad - outlaysCad;

      pos.sales.push({
        date: t._date,
        source: t._source,
         account: getTradeAccount(t),
        symbol: t._symbol,
        description: t.description || t.name || t.securityName || '',
        qtySold: sellQty,
        proceedsCad,
        acbCad,
        outlaysCad,
        gainCad,
        gainUsd: t._usd,
        fxRate: num(t.exchRate || t.exchangeRate || 1),
        raw: t
      });

      pos.qty -= sellQty;
      pos.costCad -= acbCad;

      if (pos.qty < 0.0000001) {
        pos.qty = 0;
        pos.costCad = 0;
      }
    }
  });

console.log('ACB ledger diagnostic:', {
  selectedSource,
  selectedAccount,
  transactionsAfterLandingFilter: rows.length,
  detectedSellTransactions: rows.filter(t => isSell(t)).length,
  landingHoldings: landingByHolding.size,
  ledgerPositions: ledger.size,
  generatedSales: [...ledger.values()]
    .reduce((total, pos) => total + pos.sales.length, 0)
});

console.table(
  [...ledger.values()].map(pos => ({
    source: pos.source,
    account: pos.account,
    symbol: pos.symbol,
    remainingQty: pos.qty,
    remainingCostCad: pos.costCad,
    salesCount: pos.sales.length
  }))
);
   
  return ledger;
}

function getCraCapitalGainsRows() {
  const year = els.year.value;
  const source = els.source.value;

  if (!year) return [];

  const ledger = buildAcbLedger(source);
  const rows = [];

  ledger.forEach(pos => {
    pos.sales.forEach(sale => {
      const d = new Date(sale.date);
      if (isNaN(d) || d.getFullYear() !== Number(year)) return;
      rows.push(sale);
    });
  });
console.log('Report filter diagnostic:', {
  year: els.year.value,
  source: els.source.value,
  account: els.account.value,
  generatedSaleDates: [...ledger.values()]
    .flatMap(pos => pos.sales)
    .map(sale => sale.date)
});
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  return rows;
}

/* ---------------- Rendering ---------------- */

function renderCapitalGains() {
  const rows = getCraCapitalGainsRows();

  els.tbody.innerHTML = '';

  let totalProceeds = 0;
  let totalAcb = 0;
  let totalGain = 0;

  rows.forEach(r => {
    totalProceeds += r.proceedsCad;
    totalAcb += r.acbCad;
    totalGain += r.gainCad;

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${r.source}</td>
      <td>${r.symbol}</td>
      <td>${r.description || ''}</td>
      <td class="num">${r.qtySold.toLocaleString('en-CA')}</td>
      <td class="num">${fmtCad(r.proceedsCad)}</td>
      <td class="num">${fmtCad(r.acbCad)}</td>
      <td class="num">${fmtCad(r.outlaysCad)}</td>
      <td class="num ${r.gainCad >= 0 ? 'positive' : 'negative'}">
        ${fmtCad(r.gainCad)}
      </td>
      <td class="num">${r.gainUsd ? r.gainUsd.toLocaleString('en-CA', { maximumFractionDigits: 2 }) : ''}</td>
      <td class="num">${r.fxRate ? r.fxRate.toFixed(4) : ''}</td>
    `;

    els.tbody.appendChild(tr);
  });

  els.proceeds.textContent = fmtCad(totalProceeds);
  els.acb.textContent = fmtCad(totalAcb);
  els.gain.textContent = fmtCad(totalGain);

  // CRA generally taxes one-half of a net capital gain.
  const taxableGain = totalGain > 0 ? totalGain / 2 : totalGain / 2;
  els.taxable.textContent = fmtCad(taxableGain);

  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="11" class="empty">No realized sales for this year and account source.</td>';
    els.tbody.appendChild(tr);
  }
}

/* ---------------- CSV export ---------------- */

function exportCraCsv() {
  const rows = getCraCapitalGainsRows();

  if (!rows.length) {
    alert('No capital-gains rows to export.');
    return;
  }

  const headers = [
    'Tax Year',
    'Date Sold',
    'Account Source',
    'Symbol',
    'Description',
    'Quantity Sold',
    'Proceeds CAD',
    'ACB CAD',
    'Outlays CAD',
    'Capital Gain Loss CAD',
    'Capital Gain Loss USD',
    'FX Rate',
    'Transaction Reference'
  ];

  const year = els.year.value;

  const csvRows = rows.map(r => [
    year,
    fmtDate(r.date),
    r.source,
    r.symbol,
    r.description || '',
    r.qtySold,
    r.proceedsCad.toFixed(2),
    r.acbCad.toFixed(2),
    r.outlaysCad.toFixed(2),
    r.gainCad.toFixed(2),
    r.gainUsd ? r.gainUsd.toFixed(2) : '',
    r.fxRate ? r.fxRate.toFixed(6) : '',
    r.raw._id || ''
  ]);

  const csv = [headers, ...csvRows]
    .map(row => row.map(csvEscape).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `CRA_Realized_Capital_Gains_${year}_${els.source.value}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function getTradeAccount(t) {
  return String(t.account || t.accountId || '').trim();
}

function getIbkrAccountType(account) {
  // Accept either U10455610 or 10455610.
  const digits = String(account)
    .trim()
    .toUpperCase()
    .replace(/^U/, '');

  switch (digits.charAt(0)) {
    case '9':
      return 'TFSA';
    case '2':
      return 'RRSP';
    case '1':
      return 'Non-registered';
    default:
      return 'Other';
  }
}

function populateAccountFilter() {
  const selectedSource = String(els.source.value).toUpperCase();
  const previousAccount = els.account.value || 'All';

  const accounts = new Map();

  taxData.allTrades.forEach(t => {
    const source = String(t._source || '').toUpperCase();

    if (selectedSource !== 'ALL' && source !== selectedSource) {
      return;
    }

    const account = getTradeAccount(t);
    if (!account) return;

    const label = source === 'IBKR'
      ? `${account} — ${getIbkrAccountType(account)}`
      : `${account} — ${source || 'Unknown source'}`;

    accounts.set(account, label);
  });

  els.account.replaceChildren(new Option('All accounts', 'All'));

  [...accounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([account, label]) => {
      els.account.add(new Option(label, account));
    });

  els.account.value = accounts.has(previousAccount)
    ? previousAccount
    : 'All';
}

/* ---------------- Events and init ---------------- */

els.year.addEventListener('change', renderCapitalGains);
els.source.addEventListener('change', () => {
  populateAccountFilter();
  renderCapitalGains();
});

els.account.addEventListener('change', renderCapitalGains);

els.refresh.addEventListener('click', async () => {
  try {
    await loadTaxData();
    renderCapitalGains();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load data: ${err.message}`, true);
  }
});

els.export.addEventListener('click', exportCraCsv);

(async function initTaxPage() {
  try {
    await loadTaxData();
    renderCapitalGains();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to initialize tax page: ${err.message}`, true);
  }
})();
