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
  const raw = String(
    t.source || t.account || t.accountSource || t.portfolio || ''
  ).toUpperCase();

  if (raw.includes('IBKR') || raw.includes('IB')) return 'IBKR';
  if (raw.includes('HSBC')) return 'HSBC';
  return raw || 'UNKNOWN';
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
    t.type || t.action || t.transactionType || t.side || ''
  ).trim();
}

function isBuy(t) {
  const type = getTradeType(t).toLowerCase();
  return (
    type.includes('buy') ||
    type.includes('purchase') ||
    num(t.quantity) > 0 && !type.includes('sell')
  );
}

function isSell(t) {
  const type = getTradeType(t).toLowerCase();
  return (
    type.includes('sell') ||
    type.includes('sale') ||
    num(t.quantity) < 0 && !type.includes('buy')
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

  const amount = num(
    t.amount ??
    t.grossAmount ??
    t.netAmount ??
    t.proceeds ??
    t.cost ??
    0
  );

  const fx = num(
    t.exchRate ??
    t.exchangeRate ??
    t.fxRate ??
    1
  );

  return amount * fx;
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
  const text = await res.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error('Non-JSON GAS response:', text);
    setStatus('Apps Script returned a non-JSON response. Check browser console.', true);
    return;
  }

  console.log('GAS response:', json);

  if (json.success === false) {
    const message =
      json.error ||
      json.message ||
      json.details ||
      JSON.stringify(json, null, 2);

    setStatus(`Backend error: ${message}`, true);
    return;
  }

  taxData.allTrades = normalizeTrades(json.allTrades || json.trades || []);
  taxData.transfers = json.transfers || [];
  taxData.hsbcStatements = json.hsbcStatements || [];

  populateYearFilter();
  setStatus(`Loaded ${taxData.allTrades.length.toLocaleString()} transactions.`);
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

  const rows = taxData.allTrades
    .filter(t => sourceFilter === 'All' || t._source === sourceFilter)
    .sort((a, b) => new Date(a._date) - new Date(b._date));

  rows.forEach(t => {
    const key = `${t._source}||${t._symbol}`;

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

    // Ignore HSBC Landing records for original ACB.
    if (isLanding(t)) return;

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

      if (pos.qty <= 0) return;

      const avgCostCad = pos.costCad / pos.qty;
      const acbCad = avgCostCad * sellQty;

      const proceedsCad = Math.abs(t._cad);
      const outlaysCad = t._feesCad;

      const gainCad = proceedsCad - acbCad - outlaysCad;

      pos.sales.push({
        date: t._date,
        source: t._source,
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

  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  return rows;
}

/* ---------------- Rendering ---------------- */

function renderCraGains() {
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

/* ---------------- Events and init ---------------- */

els.year.addEventListener('change', renderCraGains);
els.source.addEventListener('change', renderCraGains);

els.refresh.addEventListener('click', async () => {
  try {
    await loadTaxData();
    renderCraGains();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load data: ${err.message}`, true);
  }
});

els.export.addEventListener('click', exportCraCsv);

(async function initTaxPage() {
  try {
    await loadTaxData();
    renderCraGains();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to initialize tax page: ${err.message}`, true);
  }
})();
