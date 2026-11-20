/* Complete tax.js: IBKR commissions counted once; original FX source retained. */
/* =========================================================
   CRA Tax Reporting — Annual Realized Capital Gains 
   ========================================================= */

const GAS_URL = localStorage.getItem('ibkr_gas_url');

// Confirmed by you as your Canadian tax-residency date.
const TAX_RESIDENCY_DATE = '2021-12-05';

let taxData = {
  allTrades: [],
  transfers: [],
  hsbcStatements: [],

  dividends: [],
  hsbcDividends: []
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
  const action = getTradeType(t).trim().toUpperCase();

  if (action) {
    return /^(BUY|BOUGHT|B|PURCHASE|PURCHASED)$/.test(action);
  }

  const qty = num(
    t._qty ?? t.quantity ?? t.qty ?? t.shares ?? 0
  );

  return qty > 0;
}

function isSell(t) {
  const action = getTradeType(t).trim().toUpperCase();

  if (action) {
    return /^(SELL|SOLD|S|SALE|DISPOSITION)$/.test(action);
  }

  const qty = num(
    t._qty ?? t.quantity ?? t.qty ?? t.shares ?? 0
  );

  return qty < 0;
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
  if (getTradeSource(t) === 'IBKR') return getIbkrCommissionCad(t);
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

  taxData.stockTaxRules = Array.isArray(data.stockTaxRules)
    ? data.stockTaxRules : [];

  // Keep the response arrays separate for now.
// getAll may already include HSBC records in dividends.
taxData.dividends = Array.isArray(data.dividends)
  ? data.dividends
  : [];

if (
  typeof window.loadForeignDividendWorksheet ===
  'function'
) {
  window.loadForeignDividendWorksheet(
    taxData.dividends,
    Array.isArray(data.stockTaxRules)
      ? data.stockTaxRules
      : []
  );
} else {
  console.warn(
    'Foreign dividend worksheet unavailable: ' +
    'loadForeignDividendWorksheet is not defined. ' +
    'Check tax-dividends.js load order and console errors.'
  );
}

taxData.hsbcDividends = Array.isArray(data.hsbcDividends)
  ? data.hsbcDividends
  : [];

logDividendSchema(); 

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

  let readinessCapitalError = '';
  try {
    CapitalGains();
    capitalYear.refresh();
    readinessCapitalError = capitalYear.error || '';
  } catch (err) {
    readinessCapitalError = String(err.message || err);
    throw err;
  } finally {
    if (typeof window.loadTaxReadiness === 'function') {
      let dividendRows = [];
      let dividendError = '';
      try {
        if (typeof window.getDividendReadinessSnapshot !== 'function') {
          throw new Error('Dividend review snapshot unavailable.');
        }
        dividendRows = window.getDividendReadinessSnapshot();
      } catch (err) {
        dividendError = String(err.message || err);
      }
      try {
        await window.loadTaxReadiness({
          url: GAS_URL,
          trades: taxData.allTrades,
          dividends: taxData.dividends,
          capitalSales: capitalYear.sales || [],
          capitalError: readinessCapitalError,
          dividendRows: dividendRows,
          dividendError: dividendError,
          state: data.taxReadiness || null
        });
      } catch (err) {
        console.error('Readiness workspace initialization failed:', err);
      }
    }
  }
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

function buildAcbLedger(sourceFilter, accountFilter) {
  const ledger = new Map();

  const selectedSource = String(sourceFilter || 'All').toUpperCase();
  const selectedAccount = accountFilter === undefined
    ? (els.account.value || 'All')
    : (accountFilter || 'All');

const debugSymbol = '03GB2311R';

console.log(
  '03GB2311R raw normalized records:',
  JSON.stringify(
    taxData.allTrades
      .filter(t => {
        const values = [
          t.symbol,
          t._symbol,
          t.securityId
        ];

        return values.some(value =>
          String(value || '')
            .trim()
            .toUpperCase()
            .includes(debugSymbol)
        );
      })
      .map(t => ({
        date: t.date,
        normalizedDate: t._date,

        source: t.source,
        normalizedSource: t._source,

        account: t.account,
        accountId: t.accountId,
        resolvedAccount: getTradeAccount(t),

        symbol: t.symbol,
        normalizedSymbol: t._symbol,
        securityId: t.securityId,

        action: t.action,
        resolvedAction: getTradeType(t),
        isLanding: isLanding(t),

        quantity: t.quantity,
        normalizedQuantity: t._qty,

        currency: t.currency,
        amount: t.amount,
        cadAmount: t.cadAmount,

        reference: t.reference,
        statementKey: t.statementKey
      })),
    null,
    2
  )
);

   
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

// Exclude pre-residency HSBC transactions from this tax-basis ledger.
// Keep the original records in taxData.allTrades for other reports.
rows = rows.filter(t => {
  const source = String(t._source || '').toUpperCase();

  if (source !== 'HSBC') return true;

  const date = new Date(t._date);

  if (!Number.isFinite(date.getTime())) {
    throw new Error(
      `Invalid HSBC transaction date: ` +
      `${getTradeAccount(t)} / ${t._symbol}`
    );
  }

  // Compare the calendar date, including the whole residency date.
  return date.toISOString().slice(0, 10) >= TAX_RESIDENCY_DATE;
});
   
console.table(
  rows
    .filter(t => isSell(t))
    .map(t => ({
      date: t._date,
      account: getTradeAccount(t),
      symbol: t._symbol,
      action: t.action,
      type: t.type,
      detectedAction: getTradeType(t),
      quantity: t._qty,
      matchesBuy: isBuy(t),
      matchesSell: isSell(t),
      matchesLanding: isLanding(t),
      matchesCaOut: isCorporateActionOut(t),
      matchesCaIn: isCorporateActionIn(t)
    }))
);

console.table(
  rows
    .filter(t => t._symbol === 'TSM')
    .map(t => ({
      date: t._date,
      source: t._source,
      account: getTradeAccount(t),
      symbol: t._symbol,
      action: getTradeType(t),
      rawQuantity: t.quantity,
      normalizedQuantity: t._qty,
      cadAmount: t.cadAmount,
      normalizedCad: t._cad,
      isBuy: isBuy(t),
      isSell: isSell(t),
      isLanding: isLanding(t),
      isCaOut: isCorporateActionOut(t),
      isCaIn: isCorporateActionIn(t),
      ledgerKey: holdingKey(t)
    }))
);
   
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

  // Initialize only once for each source/account/symbol.
  if (!ledger.has(key)) {
    ledger.set(key, {
  source: t._source,
    account: getTradeAccount(t),
    symbol: t._symbol,
    currency: '',
    qty: 0,
    costNative: 0,
    costCad: 0,
    sales: []
    });
  }

  const pos = ledger.get(key);

   if (
  String(t._symbol || '').trim().toUpperCase() === '03GB2311R'
) {
  console.log('03GB2311R ledger trace:', {
    date: t._date,
    action: getTradeType(t),
    key,

    quantity: t._qty,
    isLanding: isLanding(t),
    isBuy: isBuy(t),
    isSell: isSell(t),
    isCorporateActionOut: isCorporateActionOut(t),
    isCorporateActionIn: isCorporateActionIn(t),

    positionQtyBefore: pos.qty,
    positionCostNativeBefore: pos.costNative,
    positionCostCadBefore: pos.costCad,

    matchedLandingDate:
      landingByHolding.get(key)?.record._date || null
  });
}

   const tradeCurrency = String(t.currency || '')
  .trim()
  .toUpperCase();

// Only validate currency for events that establish or use cost.
if (
  isLanding(t) ||
  isBuy(t) ||
  isSell(t) 
) {
  if (!tradeCurrency) {
    throw new Error(
      `Missing currency: ${getTradeAccount(t)} / ${t._symbol}`
    );
  }

  if (pos.currency && pos.currency !== tradeCurrency) {
    throw new Error(
      `Mixed currencies in native ACB pool: ` +
      `${getTradeAccount(t)} / ${t._symbol} ` +
      `(${pos.currency} and ${tradeCurrency}).`
    );
  }

  pos.currency = tradeCurrency;
}

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

// Landing amount is the native-currency opening valuation.
// Do not add historical purchase commissions here.
pos.costNative = getNativeAmount(t);

pos.costCad = openingCad;

  // Landing establishes the opening basis, not a reported sale.
  return;
}

// Corporate actions affect share quantity only.
// Preserve both cost pools and do not create report rows.
if (isCorporateActionOut(t)) {
  pos.qty -= Math.abs(t._qty);
  return;
}

if (isCorporateActionIn(t)) {
  pos.qty += Math.abs(t._qty);
  return;
}
 

if (isBuy(t)) {
  const buyQty = Math.abs(t._qty);

  const ibkrBuy = t._source === 'IBKR' ? getIbkrTradeAmounts(t, 'BUY') : null;
  const buyCostNative = ibkrBuy ? ibkrBuy.nativeAmount
    : getNativeAmount(t) + getFeesNative(t);
  const buyCostCad = ibkrBuy ? ibkrBuy.cadAmount
    : Math.abs(t._cad) + t._feesCad;

  pos.qty += buyQty;
  pos.costNative += buyCostNative;
  pos.costCad += buyCostCad;

  return;
}

if (isSell(t)) {
  const sellQty = Math.abs(t._qty);
  const tolerance = 0.0000001;

  if (!Number.isFinite(sellQty) || sellQty <= 0) {
    throw new Error(
      `Invalid sell quantity: ` +
      `${getTradeAccount(t)} / ${t._symbol}`
    );
  }

  if (pos.qty <= 0) {
    throw new Error(
      `Cannot calculate sale: no opening quantity for ` +
      `${getTradeAccount(t)} / ${t._symbol} / ${fmtDate(t._date)}`
    );
  }

 if (sellQty > pos.qty + tolerance) {
  console.error('Sell quantity mismatch:', {
    date: t._date,
    account: getTradeAccount(t),
    symbol: t._symbol,
    action: getTradeType(t),
    sellQty,
    availableQty: pos.qty,
    costNative: pos.costNative,
    costCad: pos.costCad
  });

  throw new Error(
    `Sell quantity exceeds available quantity: ` +
    `${getTradeAccount(t)} / ${t._symbol} / ${fmtDate(t._date)}. ` +
    `Selling ${sellQty}; available ${pos.qty}.`
  );
}

  // Use the same share proportion for both cost pools.
  const soldFraction = Math.min(sellQty / pos.qty, 1);

// Convert IBKR gross CSV amounts to net once; preserve HSBC's existing basis.
const ibkrSale = t._source === 'IBKR' ? getIbkrTradeAmounts(t, 'SELL') : null;
const proceedsNative = ibkrSale ? ibkrSale.nativeAmount : getNativeAmount(t);
const acbNative = pos.costNative * soldFraction;
const commissionNative = getFeesNative(t);

// No additional selling-fee deduction.
const outlaysNative = 0;
const gainNative = proceedsNative - acbNative;

// CAD proceeds are also already NET of selling commission.
const proceedsCad = ibkrSale ? ibkrSale.cadAmount : Math.abs(t._cad);
const acbCad = pos.costCad * soldFraction;

const outlaysCad = 0;
const gainCad = proceedsCad - acbCad;

  pos.sales.push({
    date: t._date,
    source: t._source,
    account: getTradeAccount(t),
    symbol: t._symbol,
    description:
      t.description || t.name || t.securityName || '',

 action: isCorporateActionOut(t)
  ? 'Corporate Action Out'
  : 'Sell',

isCorporateAction: isCorporateActionOut(t),
includeInTotals: true,

    qtySold: sellQty,
    price:
  t.price === undefined ||
  t.price === null ||
  String(t.price).trim() === ''
    ? null
    : Number(String(t.price).replace(/,/g, '').trim()),
     
    currency: pos.currency,

    proceedsNative,
    commissionNative,
    acbNative,
    outlaysNative,
    gainNative,

    proceedsCad,
    ...(ibkrSale ? {commissionCad: ibkrSale.commissionCad,
      sourceAmountBasis: ibkrSale.sourceBasis, proceedsBasis: 'NET'} : {}),
    acbCad,
    outlaysCad,
    gainCad,

    fxRate: num(
      t.exchRate || t.exchangeRate || t.fxRate || 1
    ),

    raw: t
  });

  pos.qty -= sellQty;
  pos.costNative -= acbNative;
  pos.costCad -= acbCad;

  if (Math.abs(pos.qty) < tolerance) {
    pos.qty = 0;
    pos.costNative = 0;
    pos.costCad = 0;
  }

  return;
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

/* ---------------- ing ---------------- */

/* ---------------- Rendering ---------------- */

function CapitalGains() {
  const rows = getCraCapitalGainsRows();

  els.tbody.innerHTML = '';

  function fmtAmount(value, maximumFractionDigits = 2) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return '—';
    }

    const n = Number(value);

    if (!Number.isFinite(n)) return '—';

    return n.toLocaleString('en-CA', {
      minimumFractionDigits:
        maximumFractionDigits === 2 ? 2 : 0,
      maximumFractionDigits
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function gainClass(value) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return '';
    }

    const n = Number(value);

    return Number.isFinite(n)
      ? (n >= 0 ? 'positive' : 'negative')
      : '';
  }

  let totalProceeds = 0;
  let totalAcb = 0;
  let totalGain = 0;

  rows.forEach(r => {
    // Summary cards remain in CAD.
 if (r.includeInTotals !== false) {
  totalProceeds += r.proceedsCad;
  totalAcb += r.acbCad;
  totalGain += r.gainCad;
}

    const currency = String(
      r.currency || r.raw?.currency || ''
    ).trim().toUpperCase();

    const fxRate = Number(r.fxRate);

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${escapeHtml(fmtDate(r.date))}</td>
      <td>${escapeHtml(r.source)}</td>
      <td>${escapeHtml(r.symbol)}</td>
      <td>${escapeHtml(r.description || '')}</td>
      <td>${escapeHtml(r.action || 'Sell')}</td>

<td class="num">${fmtAmount(r.qtySold, 6)}</td>

<td class="num">${fmtAmount(r.price, 6)}</td>

<td class="num">${fmtAmount(r.proceedsNative)}</td>

<td class="num"
    title="Commission already included in net proceeds; not deducted again">
  ${fmtAmount(r.commissionNative)}
</td>

<td class="num">${fmtAmount(r.acbNative)}</td>

      <td class="num ${gainClass(r.gainNative)}">
        ${fmtAmount(r.gainNative)}
      </td>

      <td class="num">${fmtAmount(r.acbCad)}</td>

      <td class="num ${gainClass(r.gainCad)}">
        ${fmtAmount(r.gainCad)}
      </td>

      <td>${escapeHtml(currency || '—')}</td>

      <td class="num">
        ${
          Number.isFinite(fxRate) && fxRate > 0
            ? fxRate.toFixed(6)
            : '—'
        }
      </td>
    `;

    els.tbody.appendChild(tr);
  });

  els.proceeds.textContent = fmtCad(totalProceeds);
  els.acb.textContent = fmtCad(totalAcb);
  els.gain.textContent = fmtCad(totalGain);

  // Preserve the existing planning-summary calculation.
  els.taxable.textContent = fmtCad(totalGain / 2);

  if (!rows.length) {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td colspan="15" class="empty">
        No realized sales for this year and account source.
      </td>
    `;

    els.tbody.appendChild(tr);
  }
}

/* ---------------- CSV export ---------------- */

function exportCraCsv() {
  const rows = getCraCapitalGainsRows()
    .filter(r => r.includeInTotals !== false);

  // Keep the remainder of the existing export function.

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

function getNativeAmount(t) {
  // For sales, the stored amount is already net of commission.
// Return that amount without deducting commission again.
  for (const value of [t.amount, t.grossAmount]) {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    ) {
      continue;
    }

    const parsed = Number(
      String(value).replace(/,/g, '').trim()
    );

    if (Number.isFinite(parsed)) {
      return Math.abs(parsed);
    }
  }

  // Some HSBC records contain only quantity and price.
  const quantity = Math.abs(getQuantity(t));

  const price = Number(
    String(t.price ?? '').replace(/,/g, '').trim()
  );

  if (
    quantity > 0 &&
    t.price !== undefined &&
    t.price !== null &&
    String(t.price).trim() !== '' &&
    Number.isFinite(price)
  ) {
    return quantity * Math.abs(price);
  }

  throw new Error(
    `Missing native trade amount: ` +
    `${getTradeAccount(t)} / ${getSymbol(t)} / ${getTradeDate(t)}`
  );
}

function getFeesNative(t) {
  if (getTradeSource(t) === 'IBKR') return getIbkrCommissionNative(t);
  const value =
    t.comm ??
    t.commission ??
    t.fee ??
    t.fees ??
    0;

  const fee = Number(
    String(value).replace(/,/g, '').trim()
  );

  if (!Number.isFinite(fee)) {
    throw new Error(
      `Invalid commission: ${getTradeAccount(t)} / ${getSymbol(t)}`
    );
  }

  if (fee === 0) return 0;

  const tradeCurrency = String(t.currency || '')
    .trim()
    .toUpperCase();

  const feeCurrency = String(
    t.commissionCurrency ||
    t.feeCurrency ||
    tradeCurrency
  ).trim().toUpperCase();

  if (feeCurrency !== tradeCurrency) {
    throw new Error(
      `Commission currency differs from trade currency: ` +
      `${getSymbol(t)} (${feeCurrency} vs ${tradeCurrency}). ` +
      `A fee conversion is required.`
    );
  }

  return Math.abs(fee);
}


/* IBKR: supplied CSV importer stores gross Proceeds in amount, and fees in comm.
   Return all-in purchase cost or net sale proceeds; never deduct fees twice. */
function ibkrNumber(value,label){
 const text=String(value??'').trim().replace(/,/g,'');
 if(!text||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))throw new Error('IBKR '+label+' is missing or invalid.');
 const n=Number(text);if(!Number.isFinite(n))throw new Error('IBKR '+label+' is invalid.');return n;
}
function ibkrPresent(v){return v!==undefined&&v!==null&&String(v).trim()!=='';}
function getIbkrCommissionNative(t){
 const key=['comm','commission','fee','fees'].find(k=>ibkrPresent(t[k]));
 const fee=key?Math.abs(ibkrNumber(t[key],'commission')):0;if(!fee)return 0;
 const c=String(t.currency||'').trim().toUpperCase(),fc=String(t.commissionCurrency||t.feeCurrency||c).trim().toUpperCase();
 if(!c||fc!==c)throw new Error('IBKR commission currency differs from trade currency; review '+getTradeAccount(t)+' / '+getSymbol(t)+'.');return fee;
}
function getIbkrCommissionCad(t){
 const fee=getIbkrCommissionNative(t);if(!fee)return 0;
 if(ibkrPresent(t.feeCad)){const v=Math.abs(ibkrNumber(t.feeCad,'commission CAD'));if(v<=0)throw new Error('IBKR nonzero commission requires a positive CAD commission.');return v;}
 if(String(t.currency||'').trim().toUpperCase()==='CAD')return fee;
 const key=['exchRate','exchangeRate','fxRate'].find(k=>ibkrPresent(t[k]));const rate=key?ibkrNumber(t[key],'commission FX rate'):NaN;
 if(!Number.isFinite(rate)||rate<=0)throw new Error('IBKR commission requires a supported transaction FX rate for '+getTradeAccount(t)+' / '+getSymbol(t)+'.');return fee*rate;
}
function getIbkrSourceBasis(t,side,amount,fee){
 const explicit=String(t.amountBasis||'').trim().toUpperCase();if(explicit){if(!['GROSS','NET'].includes(explicit))throw new Error('IBKR amountBasis must be GROSS or NET.');return explicit;}
 if(!fee)return 'GROSS';
 const q=Math.abs(getQuantity(t)),p=ibkrPresent(t.price)?Math.abs(ibkrNumber(t.price,'price')):NaN;
 const mult=ibkrPresent(t.multiplier)?ibkrNumber(t.multiplier,'contract multiplier'):1;if(!(mult>0))throw new Error('IBKR contract multiplier must be positive.');
 if(q>0&&Number.isFinite(p)){
  const gross=q*p*mult,cash=gross+(side==='BUY'?fee:-fee),dg=Math.abs(amount-gross),dn=Math.abs(amount-cash),g=dg<=.02000001,n=dn<=.02000001;
  if(g&&!n)return 'GROSS';if(n&&!g)return 'NET';
  if(g&&n){if(dg<=1e-7&&dn>1e-7)return 'GROSS';if(dn<=1e-7&&dg>1e-7)return 'NET';throw new Error('IBKR gross/net commission basis is ambiguous for '+getTradeAccount(t)+' / '+getSymbol(t)+'. Reconcile the source amount.');}
 }
 // Known legacy parser contract, including rounded/averaged execution prices.
 if(ibkrPresent(t.amount)&&ibkrPresent(t.comm))return 'GROSS';
 if(!ibkrPresent(t.amount)&&ibkrPresent(t.grossAmount))return 'GROSS';
 throw new Error('IBKR source amount cannot be verified as gross or net for '+getTradeAccount(t)+' / '+getSymbol(t)+'. Review its import format.');
}
function getIbkrTradeAmounts(t,side){
 if(!['BUY','SELL'].includes(side))throw new Error('Invalid IBKR trade side.');
 const key=['amount','grossAmount','netAmount'].find(k=>ibkrPresent(t[k])),fee=getIbkrCommissionNative(t),feeCad=getIbkrCommissionCad(t);
 const rawNative=key?Math.abs(ibkrNumber(t[key],'trade amount')):Math.abs(getQuantity(t))*Math.abs(ibkrNumber(t.price,'price'));
 const basis=key==='netAmount'?'NET':!key?'GROSS':getIbkrSourceBasis(t,side,rawNative,fee);
 const rawCad=ibkrPresent(t.cadAmount)?Math.abs(ibkrNumber(t.cadAmount,'trade CAD amount')):ibkrPresent(t._cad)?Math.abs(ibkrNumber(t._cad,'trade CAD amount')):Math.abs(getCadAmount(t));
 if(rawNative>0&&rawCad===0)throw new Error('IBKR positive trade amount has no positive CAD valuation.');
 const sign=side==='BUY'?1:-1,nativeAmount=rawNative+(basis==='GROSS'?sign*fee:0),cadAmount=rawCad+(basis==='GROSS'?sign*feeCad:0);
 if(!Number.isFinite(nativeAmount)||!Number.isFinite(cadAmount)||nativeAmount<0||cadAmount<0)throw new Error('IBKR commission-adjusted cash amount is invalid or negative; review '+getTradeAccount(t)+' / '+getSymbol(t)+'.');
 return {nativeAmount,cadAmount,commissionNative:fee,commissionCad:feeCad,sourceBasis:basis};
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

function logDividendSchema() {
  const main = taxData.dividends;
  const hsbc = taxData.hsbcDividends;

  function actionOf(row) {
    return String(
      row.action || row.transactionType || ''
    ).trim().toUpperCase();
  }

  function isWithholding(row) {
    return /WITHHOLD|WITHHELD/.test(actionOf(row));
  }

  function isDividend(row) {
    return !isWithholding(row) &&
      /DIV/.test(actionOf(row));
  }

  function isHsbc(row) {
    return String(row.source || '')
      .trim()
      .toUpperCase() === 'HSBC';
  }

  function sample(rows, predicate) {
    return rows.filter(predicate).slice(0, 2);
  }

  const sourceCounts = {};

  main.forEach(row => {
    const source = String(row.source || 'UNKNOWN')
      .trim()
      .toUpperCase();

    sourceCounts[source] =
      (sourceCounts[source] || 0) + 1;
  });

  const diagnostic = {
    counts: {
      dividends: main.length,
      hsbcDividends: hsbc.length,
      sourcesInDividends: sourceCounts
    },

    // Complete objects preserve all available field names.
    ibkrDividend: sample(
      main,
      row =>
        String(row.source || '').toUpperCase() === 'IBKR' &&
        isDividend(row)
    ),

    ibkrWithholding: sample(
      main,
      row =>
        String(row.source || '').toUpperCase() === 'IBKR' &&
        isWithholding(row)
    ),

    hsbcDividend: sample(
      hsbc.length ? hsbc : main.filter(isHsbc),
      isDividend
    ),

    hsbcWithholding: sample(
      hsbc.length ? hsbc : main.filter(isHsbc),
      isWithholding
    ),

    // Useful if source/action labels differ from expectations.
    firstMainRecord: main[0] || null,
    firstHsbcRecord: hsbc[0] || null
  };

  console.log(
    'DIVIDEND WORKSHEET SCHEMA:\n' +
    JSON.stringify(diagnostic, null, 2)
  );
}


/* Capital-gains yearly review: presentation and isolated planning scenarios. */
const capitalYear = {
  root: null, detail: null, tab: 'year', ledger: new Map(), sales: [], error: '',
  source: 'All', account: 'All', category: 'All', measure: 'gainCad',
  expanded: new Set(), scenarios: [], sequence: 0, cutoff: '',
  measures: {proceedsCad:'Net sale proceeds',acbCad:'ACB sold',gainCad:'Realized gain / loss',count:'Dispositions'},
  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
  fmt(value) { return Number.isFinite(value) ? value.toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'; },
  normalize(symbol) {
    const s=String(symbol || '').trim().toUpperCase(); const m=s.match(/^(\d{1,5})\.HK$/);
    return m ? m[1].padStart(5,'0')+'.HK' : s;
  },
  key(row) { return JSON.stringify([row.source,row.account,row.symbol]); },
  categoryOf(row) {
    const related=taxData.allTrades.filter(t => t._source===row.source && getTradeAccount(t)===row.account && t._symbol===row.symbol);
    if(row.source==='IBKR') {
      for(const record of [row.raw || {},...related]) {
        for(const field of ['isin','ISIN','securityId','description']) {
          const m=String(record[field] || '').toUpperCase().match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
          if(m) return m[1].startsWith('CA') ? 'Canadian security — inferred' : m[1].startsWith('US') ? 'US security — inferred' : 'Other security — review';
        }
      }
      return 'UNKNOWN';
    }
    const rule=(taxData.stockTaxRules || []).find(r => this.normalize(r.symbol)===this.normalize(row.symbol));
    return String(rule?.shareType || row.raw?.shareType || 'UNKNOWN').toUpperCase();
  },
  ensureUI() {
    if(this.root) return;
    const card=document.getElementById('cra-gains-table')?.closest('.card');
    if(!card) return;
    const detail=document.createElement('div');
    while(card.firstChild) detail.appendChild(card.firstChild);
    const nav=document.createElement('div');nav.className='cgy-nav';
    nav.innerHTML='<button type="button" data-cgy-tab="detail">Detailed Capital Gains</button><button type="button" data-cgy-tab="year">Yearly Review & Forecast</button>';
    const root=document.createElement('section');root.id='capital-year-review';
    card.append(nav,detail,root);this.root=root;this.detail=detail;
    card.classList.add('capital-year-card');
    nav.onclick=e => {const b=e.target.closest('[data-cgy-tab]');if(b){this.tab=b.dataset.cgyTab;this.render();}};
  },
  refresh() {
    this.ensureUI(); if(!this.root) return;
    this.error='';this.ledger=new Map();this.sales=[];
    try {
      this.ledger=buildAcbLedger('All','All');
      this.sales=[...this.ledger.values()].flatMap(p => p.sales).filter(r => r.includeInTotals!==false)
        .map(r => ({...r,category:this.categoryOf(r)}));
      for(const p of this.ledger.values()) p.yearCategory=this.categoryOf(p);
      this.cutoff=taxData.allTrades.map(t => fmtDate(t._date)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1) || '';
      if(this.scenarios.length) this.error='Data refreshed: planned sales were cleared. Re-enter scenarios against the refreshed remaining positions.';
      this.scenarios=[];
    } catch(e) { this.error='Yearly ledger unavailable: '+e.message; }
    this.render();
  },
  planRows() {
    const pools=new Map([...this.ledger.values()].map(p => [this.key(p),{qty:p.qty,cad:p.costCad,native:p.costNative}]));
    return [...this.scenarios].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id).map(s => {
      const p=this.ledger.get(s.positionKey); const pool=pools.get(s.positionKey);
      if(!p || !pool || s.qty>pool.qty+1e-7 || pool.qty<=0) throw new Error('Planned quantity exceeds the remaining position.');
      const fraction=Math.min(s.qty/pool.qty,1);
      const acbCad=pool.cad*fraction, acbNative=pool.native*fraction;
      const proceedsNative=s.qty*s.price-s.fee;
      const proceedsCad=proceedsNative*s.fx;
      pool.qty-=s.qty;pool.cad-=acbCad;pool.native-=acbNative;
      return {date:s.date,source:p.source,account:p.account,symbol:p.symbol,category:p.yearCategory,currency:p.currency,
        qtySold:s.qty,proceedsNative,proceedsCad,acbNative,acbCad,gainNative:proceedsNative-acbNative,gainCad:proceedsCad-acbCad,
        forecast:true,scenarioId:s.id};
    });
  },
  render() {
    if(!this.root) return;
    const root=this.root,E=v=>this.esc(v),s=this;
    this.detail.hidden=this.tab!=='detail';root.hidden=this.tab!=='year';
    root.parentElement.querySelectorAll('[data-cgy-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cgyTab===this.tab)));
    let plans=[];try{plans=this.planRows();}catch(e){this.error=e.message;}
    const all=this.sales.concat(plans);
    const unique=a=>[...new Set(a)].sort();
    const sources=unique(all.map(r=>r.source));
    if(this.source!=='All'&&!sources.includes(this.source))this.source='All';
    const sr=all.filter(r=>this.source==='All'||r.source===this.source);
    const accounts=unique(sr.map(r=>r.account));
    if(this.account!=='All'&&!accounts.includes(this.account))this.account='All';
    const ar=sr.filter(r=>this.account==='All'||r.account===this.account);
    const categories=unique(ar.map(r=>r.category));
    if(this.category!=='All'&&!categories.includes(this.category))this.category='All';
    const scoped=ar.filter(r=>this.category==='All'||r.category===this.category);
    const years=unique(this.sales.map(r=>fmtDate(r.date).slice(0,4)));
    const current=String(new Date().getFullYear());
    const columns=years.map(y=>({year:y,basis:'actual',label:y+(y===current?' YTD':' Actual')}));
    unique(plans.map(r=>r.date.slice(0,4))).forEach(y=>{
      columns.push({year:y,basis:'plan',label:y+' planned sales'});
      columns.push({year:y,basis:'combined',label:y+' actual + planned'});
    });
    const tree=[{path:[],label:'All selected sources — total',rows:scoped,level:0,children:false}];
    for(const source of unique(scoped.map(r=>r.source))){
      const a=scoped.filter(r=>r.source===source);tree.push({path:[source],label:source,rows:a,level:0,children:true});
      for(const account of unique(a.map(r=>r.account))){
        const b=a.filter(r=>r.account===account);tree.push({path:[source,account],label:account,rows:b,level:1,children:true});
        for(const category of unique(b.map(r=>r.category)))tree.push({path:[source,account,category],label:category,rows:b.filter(r=>r.category===category),level:2,children:false});
      }
    }
    const visible=tree.filter(n=>n.path.length<2||(this.expanded.has(JSON.stringify(n.path.slice(0,1)))&&(n.path.length<3||this.expanded.has(JSON.stringify(n.path.slice(0,2))))));
    const select=(key,label,values)=>`<label>${label}<select data-cgy-filter="${key}"><option value="All">All</option>${values.map(v=>`<option value="${E(v)}" ${this[key]===v?'selected':''}>${E(v)}</option>`).join('')}</select></label>`;
    const positions=[...this.ledger.values()].filter(p=>p.qty>1e-7);
    const cells=[];
    const renderCell=(node,c)=>{
      const rows=node.rows.filter(r=>fmtDate(r.date).slice(0,4)===c.year&&(c.basis==='combined'||(c.basis==='plan'?r.forecast:!r.forecast)));
      const known=rows.filter(r=>Number.isFinite(r[this.measure]));
      const value=this.measure==='count'?rows.length:known.length?known.reduce((a,r)=>a+r[this.measure],0):null;
      const missing=this.measure==='count'?0:rows.length-known.length;
      cells.push({node,column:c,rows,value,missing});
      return `<td class="cgy-num ${c.basis!=='actual'?'cgy-plan':''}"><button type="button" data-cgy-cell="${cells.length-1}">${this.measure==='count'?value:this.fmt(value)}</button>${missing?`<small>${missing} missing</small>`:''}</td>`;
    };
    root.innerHTML=`<h3>Capital Gains — Yearly Review & Forecast</h3>
      <p class="cgy-note">CAD · Existing ACB ledger · Independent of the detailed report's year/source/account filters. Historical totals cover loaded sale records only, not proof of complete reporting. IBKR categories are identifier-based groupings, not tax-domicile determinations.</p>
      ${this.error?`<p class="cgy-warning">${E(this.error)}</p>`:''}
      <div class="cgy-controls">${select('source','Source',sources)}${select('account','Account',accounts)}${select('category','Category',categories)}
      <label>Measure<select data-cgy-filter="measure">${Object.entries(this.measures).map(([k,v])=>`<option value="${k}" ${this.measure===k?'selected':''}>${E(v)}</option>`).join('')}</select></label>
      <button type="button" data-cgy-action="expand">Expand all</button><button type="button" data-cgy-action="collapse">Collapse all</button><button type="button" data-cgy-action="export">Export matrix CSV</button></div>
      <div class="cgy-scroll"><table class="cgy-table"><thead><tr><th>Source → Account → Category</th>${columns.map(c=>`<th class="${c.basis!=='actual'?'cgy-plan':''}">${E(c.label)}</th>`).join('')}</tr></thead><tbody>${visible.map(n=>`<tr><th style="padding-left:${12+n.level*20}px">${n.children?`<button type="button" data-cgy-node="${E(JSON.stringify(n.path))}" aria-expanded="${this.expanded.has(JSON.stringify(n.path))}">${this.expanded.has(JSON.stringify(n.path))?'−':'+'} ${E(n.label)}</button>`:E(n.label)}</th>${columns.map(c=>renderCell(n,c)).join('')}</tr>`).join('')}</tbody></table></div>
      ${!columns.length?'<p>No loaded sales or planned-sale scenarios.</p>':''}
      <details class="cgy-planning"><summary>Planned-sale forecast — manual assumptions</summary>
      <p class="cgy-note">Remaining positions are the existing engine's end-of-loaded-ledger positions (latest loaded transaction: ${E(this.cutoff||'unavailable')}). This is not a live holdings feed. Scenarios must be dated after that snapshot, assume no intervening purchases or corporate actions, and allocate the existing remaining ACB proportionally. Multiple plans for one position consume its quantity in date order. Plans stay in memory only and are cleared on data refresh. This is not a final tax-payable calculation.</p>
      <form data-cgy-form class="cgy-controls">
      <label>Remaining position<select name="position" required>${positions.map(p=>`<option value="${E(this.key(p))}">${E(p.source+' / '+p.account+' / '+p.symbol+' · '+p.qty+' '+p.currency)}</option>`).join('')}</select></label>
      <label>Sale date<input name="date" type="date" min="${E(this.minimumPlanDate())}" required></label>
      <label>Quantity<input name="qty" type="number" min="0.00000001" step="any" required></label>
      <label>Price / unit (position CCY)<input name="price" type="number" min="0" step="any" required></label>
      <label>Selling fee (same CCY)<input name="fee" type="number" min="0" step="any" value="0" required></label>
      <label>CAD per 1 native unit<input name="fx" type="number" min="0.00000001" step="any" required></label>
      <button type="submit" ${!positions.length?'disabled':''}>Add planned sale</button></form>
      <p class="cgy-note">CAD positions require FX = 1. Estimated proceeds = quantity × price − selling fee; estimated gain = CAD proceeds − allocated existing CAD ACB. Historical selling fees remain handled by the original engine and are not deducted twice.</p>
      <ul>${this.scenarios.map(p=>{const row=plans.find(r=>r.scenarioId===p.id);return `<li>${E(p.date)} · ${E(row?.symbol)} · ${p.qty} units · estimated gain CAD ${this.fmt(row?.gainCad)} <button type="button" data-cgy-remove="${p.id}">Remove</button></li>`;}).join('')}</ul>
      <button type="button" data-cgy-action="clear">Clear planned sales</button>
      </details><div data-cgy-records></div>`;
    root.onchange=e=>{
      const k=e.target.dataset.cgyFilter;if(!k)return;
      this[k]=e.target.value;if(k==='source'){this.account='All';this.category='All';}if(k==='account')this.category='All';this.render();
    };
    root.onsubmit=e=>{
      if(!e.target.matches('[data-cgy-form]'))return;e.preventDefault();
      const f=new FormData(e.target),positionKey=f.get('position'),p=this.ledger.get(positionKey);
      const entry={id:++this.sequence,positionKey,date:String(f.get('date')),qty:Number(f.get('qty')),price:Number(f.get('price')),fee:Number(f.get('fee')),fx:Number(f.get('fx'))};
      try{
        if(!p)throw new Error('Select a remaining position.');
        if(entry.date<this.minimumPlanDate()||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date))throw new Error('Choose a sale date on or after '+this.minimumPlanDate()+'.');
        if(![entry.qty,entry.price,entry.fee,entry.fx].every(Number.isFinite)||entry.qty<=0||entry.price<0||entry.fee<0||entry.fx<=0)throw new Error('Enter valid quantity, price, fee and FX assumptions.');
        if(p.currency==='CAD'&&entry.fx!==1)throw new Error('Use FX = 1 for CAD positions.');
        if(entry.fee>entry.qty*entry.price)throw new Error('Selling fee exceeds gross proceeds.');
        this.scenarios.push(entry);
        try{this.planRows();}catch(err){this.scenarios=this.scenarios.filter(r=>r.id!==entry.id);throw err;}
        this.error='';this.render();this.root.querySelector('.cgy-planning').open=true;
      }catch(err){alert(err.message);}
    };
    root.onclick=e=>{
      const node=e.target.closest('[data-cgy-node]');if(node){const k=node.dataset.cgyNode;if(this.expanded.has(k))this.expanded.delete(k);else this.expanded.add(k);this.render();return;}
      const remove=e.target.closest('[data-cgy-remove]');if(remove){this.scenarios=this.scenarios.filter(p=>p.id!==Number(remove.dataset.cgyRemove));this.render();this.root.querySelector('.cgy-planning').open=true;return;}
      const action=e.target.closest('[data-cgy-action]')?.dataset.cgyAction;
      if(action==='expand'||action==='collapse'){this.expanded.clear();if(action==='expand')tree.filter(n=>n.children).forEach(n=>this.expanded.add(JSON.stringify(n.path)));this.render();return;}
      if(action==='clear'){this.scenarios=[];this.render();return;}
      if(action==='export'){
        const lines=[['Measure','Source','Account','Category','Year','Basis','Value CAD or count','Missing','Records']];
        cells.forEach(c=>lines.push([this.measures[this.measure],...Array.from({length:3},(_,i)=>c.node.path[i]||''),c.column.year,c.column.basis,c.value??'',c.missing,c.rows.length]));
        const quote=v=>{let t=String(v);if(typeof v==='string'&&/^[=+\-@\t\r\n]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
        const url=URL.createObjectURL(new Blob(['\uFEFF',lines.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));
        const a=document.createElement('a');a.href=url;a.download='Capital_Gains_Yearly_Matrix.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
      }
      const b=e.target.closest('[data-cgy-cell]');if(!b)return;const c=cells[Number(b.dataset.cgyCell)];
      const supportingRows = [...c.rows].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );

      root.querySelector('[data-cgy-records]').innerHTML = `
        <h4>
          ${E(c.node.label)}
          · ${E(c.column.label)}
          — Capital-gains supporting records
        </h4>

        <p class="cgy-note">
          Proceeds, ACB and gain/loss are shown in both
          native currency and CAD. Proceeds are net of
          selling fees under the existing ledger calculation;
          selling fees are not deducted again.
        </p>

        <div class="cgy-scroll">
          <table class="cgy-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Account</th>
                <th>Symbol</th>
                <th>Category</th>
                <th class="cgy-num">Quantity</th>
                <th>CCY</th>

                <th class="cgy-num">Proceeds Native</th>
                <th class="cgy-num">ACB Native</th>
                <th class="cgy-num">Gain/Loss Native</th>

                <th class="cgy-num">Proceeds CAD</th>
                <th class="cgy-num">ACB CAD</th>
                <th class="cgy-num">Gain/Loss CAD</th>

                <th>Basis</th>
              </tr>
            </thead>

            <tbody>
              ${
                supportingRows.map(row => `
                  <tr>
                    <td>${E(fmtDate(row.date))}</td>
                    <td>${E(row.source)}</td>
                    <td>${E(row.account)}</td>
                    <td>${E(row.symbol)}</td>
                    <td>${E(row.category)}</td>

                    <td class="cgy-num">
                      ${E(row.qtySold)}
                    </td>

                    <td>${E(row.currency || '—')}</td>

                    <td class="cgy-num">
                      ${this.fmt(row.proceedsNative)}
                    </td>

                    <td class="cgy-num">
                      ${this.fmt(row.acbNative)}
                    </td>

                    <td class="cgy-num">
                      ${this.fmt(row.gainNative)}
                    </td>

                    <td class="cgy-num">
                      ${this.fmt(row.proceedsCad)}
                    </td>

                    <td class="cgy-num">
                      ${this.fmt(row.acbCad)}
                    </td>

                    <td class="cgy-num">
                      ${this.fmt(row.gainCad)}
                    </td>

                    <td>
                      ${
                        row.forecast
                          ? 'Planned-sale estimate'
                          : 'Actual ledger sale'
                      }
                    </td>
                  </tr>
                `).join('') || `
                  <tr>
                    <td colspan="14">—</td>
                  </tr>
                `
              }
            </tbody>
          </table>
        </div>
      `;
    };
  },
  minimumPlanDate() {
    const today=new Date();const local=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    if(!this.cutoff||this.cutoff<local)return local;
    const next=new Date(this.cutoff+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);return next.toISOString().slice(0,10);
  }
};

/* ---------------- Events and init ---------------- */

els.year.addEventListener('change', CapitalGains);
els.source.addEventListener('change', () => {
  populateAccountFilter();
  CapitalGains();
});

els.account.addEventListener('change', CapitalGains);

els.refresh.addEventListener('click', async () => {
  try {
    await loadTaxData();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load data: ${err.message}`, true);
  }
});

els.export.addEventListener('click', exportCraCsv);

(async function initTaxPage() {
  try {
    await loadTaxData();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to initialize tax page: ${err.message}`, true);
  }
})();
