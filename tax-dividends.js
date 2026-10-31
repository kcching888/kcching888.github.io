/* Foreign dividend review worksheet.
   Reads getAll's merged dividends array only.
   Does not change capital-gains calculations or source records. */

(function () {
  'use strict';

  let worksheetRows = [];
  let host = null;

  const number = value => {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ''
    ) return null;

    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };

  const text = value => String(value ?? '').trim();

  const escape = value => text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const format = value => value === null ||
    value === undefined ||
    !Number.isFinite(value)
      ? '—'
      : value.toLocaleString('en-CA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

  function dateOf(row) {
    const d = new Date(row.date);
    return Number.isFinite(d.getTime())
      ? d.toISOString().slice(0, 10)
      : '';
  }

  function sourceOf(row) {
    return text(row.source).toUpperCase();
  }

  function isTax(row) {
    return /WITHHOLD|WITHHELD/i.test(text(row.action));
  }

  function isDividend(row) {
    return !isTax(row) &&
      /DIV/i.test(text(row.action));
  }

  function cadValue(row) {
    const stored = number(row.cadAmount);
    if (stored !== null) return stored;

    const amount = number(row.amount);
    const currency = text(row.currency).toUpperCase();

    if (amount === null) return null;
    if (currency === 'CAD') return amount;

    const rate = number(row.exchRate);

    return rate !== null && rate > 0
      ? amount * rate
      : null;
  }

  function sumKnown(values) {
    return values.every(v => v !== null)
      ? values.reduce((sum, v) => sum + v, 0)
      : null;
  }

  function eventKey(row) {
    return JSON.stringify([
      sourceOf(row),
      text(row.account),
      dateOf(row),
      text(row.symbol).toUpperCase(),
      text(row.currency).toUpperCase()
    ]);
  }

  function classification(row) {
    const description = text(row.description);

    if (/RETURN OF CAPITAL/i.test(description)) {
      return 'Return of capital — exclude/review';
    }

    const isin = description.match(
      /\(([A-Z]{2}[A-Z0-9]{10})\)/
    );

    if (sourceOf(row) === 'IBKR' && isin) {
      return isin[1].startsWith('CA')
        ? 'Canadian security — review distribution'
        : 'Foreign security — verify income type';
    }

    if (sourceOf(row) === 'HSBC') {
      return /^U\d+$/i.test(text(row.symbol))
        ? 'Foreign fund — verify distribution type'
        : 'Foreign holding — verify income type';
    }

    return 'Unclassified';
  }

  function accountType(row) {
    if (sourceOf(row) !== 'IBKR') {
      return 'Verify account registration';
    }

    const prefix = text(row.account)
      .toUpperCase()
      .replace(/^U/, '')
      .charAt(0);

    return {
      '1': 'Non-registered',
      '2': 'RRSP',
      '9': 'TFSA'
    }[prefix] || 'Unknown account type';
  }

  function feeValues(row) {
    const raw = number(row.fees);

    // Blank fees are unknown, not automatically zero.
    if (raw === null) {
      return { native: null, cad: null };
    }

    if (raw === 0) return { native: 0, cad: 0 };

    const fee = Math.abs(raw);

    const currency = text(row.currency).toUpperCase();

    const feeCurrency = text(
      row.feesCurrency || row.currency
    ).toUpperCase();

    let feeCad = number(row.feesCad);

    if (feeCad !== null) feeCad = Math.abs(feeCad);

    if (feeCad === null && feeCurrency === 'CAD') {
      feeCad = fee;
    }

    if (feeCad === null && feeCurrency === currency) {
      const rate = number(row.exchRate);

      if (rate !== null && rate > 0) {
        feeCad = fee * rate;
      }
    }

    return {
      native: feeCurrency === currency ? fee : null,
      cad: feeCad
    };
  }

  function buildRows(records) {
    const dividends = records.filter(isDividend);
    const taxes = records.filter(isTax);

    const dividendGroups = new Map();
    const usedTaxes = new Set();

    dividends.forEach(row => {
      const key = eventKey(row);
      const group = dividendGroups.get(key) || [];
      group.push(row);
      dividendGroups.set(key, group);
    });

    const output = dividends.map(dividend => {
      const issues = [];
      const key = eventKey(dividend);

      const candidates = taxes.filter(tax =>
        eventKey(tax) === key
      );

      let matched = [];

      // Exact reference takes priority.
      const reference = text(dividend.reference);

      if (reference) {
        const sameReference = candidates.filter(tax =>
          text(tax.reference) === reference
        );

        const sameReferenceDividends =
          dividendGroups.get(key).filter(row =>
            text(row.reference) === reference
          );

        if (
          sameReferenceDividends.length === 1 &&
          sameReference.length === 1
        ) {
          matched = sameReference;
        }
      }

      // No reference match: only pair a unique dividend
      // with a unique withholding record.
      if (
        matched.length === 0 &&
        dividendGroups.get(key).length === 1 &&
        candidates.length === 1
      ) {
        matched = candidates;
        issues.push('Withholding matched by date/account/symbol/CCY');
      }

      if (
        candidates.length > 0 &&
        matched.length === 0
      ) {
        issues.push('Ambiguous withholding match');
      }

      matched.forEach(row => usedTaxes.add(row));

      const withholding = matched.length
        ? sumKnown(matched.map(row => {
            const n = number(row.amount);
            return n === null ? null : Math.abs(n);
          }))
        : null;

      const withholdingCad = matched.length
        ? sumKnown(matched.map(row => {
            const n = cadValue(row);
            return n === null ? null : Math.abs(n);
          }))
        : null;

      const amount = number(dividend.amount);
      const amountCad = cadValue(dividend);

      const source = sourceOf(dividend);
      const fees = feeValues(dividend);

      let gross = null;
      let grossCad = null;
      let net = null;
      let netCad = null;

      if (source === 'IBKR') {
        // Working convention: IBKR dividend rows are gross.
        gross = amount;
        grossCad = amountCad;

        issues.push('Verify IBKR amount is gross');

        if (fees.native === null) {
          issues.push('Bank fee not explicitly recorded');
        }

        if (withholding === null) {
          issues.push('No matched withholding; not assumed zero');
        }

        if (
          gross !== null &&
          withholding !== null &&
          fees.native !== null
        ) {
          net = gross - withholding - fees.native;
        }

        if (
          grossCad !== null &&
          withholdingCad !== null &&
          fees.cad !== null
        ) {
          netCad = grossCad - withholdingCad - fees.cad;
        }
      } else if (source === 'HSBC') {
        // User-confirmed convention: HSBC amount is net cash.
        net = amount;
        netCad = amountCad;

        if (withholding === null) {
          issues.push('Gross unresolved: withholding not confirmed');
        }

        if (fees.native === null) {
          issues.push('Gross unresolved: native fee unavailable');
        }

        if (
          net !== null &&
          withholding !== null &&
          fees.native !== null
        ) {
          gross = net + withholding + fees.native;
          issues.push('Gross reconstructed from net + tax + fee');
        }

        if (
          netCad !== null &&
          withholdingCad !== null &&
          fees.cad !== null
        ) {
          grossCad = netCad + withholdingCad + fees.cad;
        }
      } else {
        issues.push('Unknown source');
      }

      if (amount !== null && amount < 0) {
        issues.push('Negative dividend: review reversal/correction');
      }

      if (!dateOf(dividend)) issues.push('Invalid date');
      if (amountCad === null) issues.push('Missing CAD value/FX');

      if (dividend.requiresChargeReview === true ||
          /^(true|yes|1)$/i.test(
            text(dividend.requiresChargeReview)
          )) {
        issues.push('Parser flagged charge review');
      }

      issues.push('Verify income classification');

      return {
        date: dateOf(dividend),
        source,
        account: text(dividend.account),
        accountType: accountType(dividend),
        symbol: text(dividend.symbol),
        description: text(dividend.description),
        classification: classification(dividend),
        gross,
        withholding,
        fee: fees.native,
        net,
        currency: text(dividend.currency).toUpperCase(),
        fx: number(dividend.exchRate),
        grossCad,
        withholdingCad,
        netCad,
        reference: reference || text(dividend.statementKey),
        status: issues.join('; ')
      };
    });

    // Never silently discard unmatched tax records.
    taxes.forEach(tax => {
      if (usedTaxes.has(tax)) return;

      const amount = number(tax.amount);
      const amountCad = cadValue(tax);

      output.push({
        date: dateOf(tax),
        source: sourceOf(tax),
        account: text(tax.account),
        accountType: accountType(tax),
        symbol: text(tax.symbol),
        description: text(tax.description),
        classification: 'Unmatched withholding',
        gross: null,
        withholding:
          amount === null ? null : Math.abs(amount),
        fee: null,
        net: null,
        currency: text(tax.currency).toUpperCase(),
        fx: number(tax.exchRate),
        grossCad: null,
        withholdingCad:
          amountCad === null ? null : Math.abs(amountCad),
        netCad: null,
        reference:
          text(tax.reference) || text(tax.statementKey),
        status:
          'Unmatched tax: review payment date, reference, ' +
          'duplicate/reversal status and income classification'
      });
    });

    return output.sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.account.localeCompare(b.account) ||
      a.symbol.localeCompare(b.symbol)
    );
  }

  const columns = [
    ['date', 'Date'],
    ['source', 'Source'],
    ['account', 'Account'],
    ['accountType', 'Account Type'],
    ['symbol', 'Symbol'],
    ['description', 'Description'],
    ['classification', 'Classification'],
    ['gross', 'Gross'],
    ['withholding', 'Withholding'],
    ['fee', 'Bank Fee'],
    ['net', 'Net Cash'],
    ['currency', 'CCY'],
    ['fx', 'FX Rate'],
    ['grossCad', 'Gross CAD'],
    ['withholdingCad', 'Withholding CAD'],
    ['netCad', 'Net Cash CAD'],
    ['reference', 'Reference'],
    ['status', 'Review Status']
  ];

  const numeric = new Set([
    'gross', 'withholding', 'fee', 'net', 'fx',
    'grossCad', 'withholdingCad', 'netCad'
  ]);

  function selectedRows() {
    const year = host.querySelector('[data-year]').value;
    const source = host.querySelector('[data-source]').value;
    const account = host.querySelector('[data-account]').value;

    return worksheetRows.filter(row =>
      (year === 'All' || row.date.slice(0, 4) === year) &&
      (source === 'All' || row.source === source) &&
      (account === 'All' || row.account === account)
    );
  }

  function updateAccounts() {
    const select = host.querySelector('[data-account]');
    const source = host.querySelector('[data-source]').value;
    const previous = select.value;

    const accounts = [...new Set(
      worksheetRows
        .filter(row => source === 'All' || row.source === source)
        .map(row => row.account)
        .filter(Boolean)
    )].sort();

    select.replaceChildren(new Option('All accounts', 'All'));

    accounts.forEach(account =>
      select.add(new Option(account, account))
    );

    select.value = accounts.includes(previous)
      ? previous
      : 'All';
  }

  function render() {
    const rows = selectedRows();

    host.querySelector('[data-count]').textContent =
      `${rows.length} review rows. ` +
      'Includes Canadian/unclassified records for reconciliation. ' +
      'No filing-ready total is calculated yet.';

    host.querySelector('tbody').innerHTML = rows.length
      ? rows.map(row => `
          <tr>
            ${columns.map(([key]) => {
              let value = row[key];

              if (key === 'fx') {
                value = Number.isFinite(value)
                  ? value.toFixed(6)
                  : '—';
              } else if (numeric.has(key)) {
                value = format(value);
              }

              return `<td class="${
                numeric.has(key) ? 'num' : ''
              }">${escape(value)}</td>`;
            }).join('')}
          </tr>
        `).join('')
      : `<tr><td colspan="${columns.length}" class="empty">
           No dividend or withholding records for these filters.
         </td></tr>`;
  }

  function exportCsv() {
    const rows = selectedRows();

    const cell = value => {
      let s = String(value ?? '');

      // Prevent text fields being interpreted as spreadsheet formulas.
      if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) {
        s = "'" + s;
      }

      return '"' + s.replace(/"/g, '""') + '"';
    };

    const csv = [
      columns.map(([, title]) => title),
      ...rows.map(row => columns.map(([key]) => row[key]))
    ].map(row => row.map(cell).join(',')).join('\r\n');

    const url = URL.createObjectURL(new Blob(
      ['\uFEFF', csv],
      { type: 'text/csv;charset=utf-8;' }
    ));

    const link = document.createElement('a');
    link.href = url;
    link.download = 'Dividend_Withholding_Review.csv';
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createUi() {
    host = document.createElement('section');
    host.className = 'card';
    host.id = 'foreign-dividend-worksheet';

    host.innerHTML = `
      <h2>Foreign Dividends &amp; Withholding — Review Worksheet</h2>

      <div class="filters">
        <label>Year
          <select data-year></select>
        </label>

        <label>Source
          <select data-source>
            <option value="All">All</option>
            <option value="IBKR">IBKR</option>
            <option value="HSBC">HSBC</option>
          </select>
        </label>

        <label>Account
          <select data-account>
            <option value="All">All accounts</option>
          </select>
        </label>

        <button type="button" data-export>Export Review CSV</button>
      </div>

      <p data-count class="status"></p>

      <div class="table-wrap">
        <table id="foreign-dividend-table">
          <thead><tr>
            ${columns.map(([, title]) =>
              `<th>${escape(title)}</th>`
            ).join('')}
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    document.querySelector('main').appendChild(host);

    host.querySelector('[data-source]')
      .addEventListener('change', () => {
        updateAccounts();
        render();
      });

    host.querySelector('[data-year]')
      .addEventListener('change', render);

    host.querySelector('[data-account]')
      .addEventListener('change', render);

    host.querySelector('[data-export]')
      .addEventListener('click', exportCsv);
  }

  window.loadForeignDividendWorksheet = function (records) {
    worksheetRows = buildRows(
      Array.isArray(records) ? records : []
    );

    if (!host) createUi();

    const select = host.querySelector('[data-year]');
    const previous = select.value;

    const years = [...new Set(
      worksheetRows.map(row => row.date.slice(0, 4))
        .filter(Boolean)
    )].sort().reverse();

    select.replaceChildren(new Option('All years', 'All'));

    years.forEach(year =>
      select.add(new Option(year, year))
    );

    select.value = years.includes(previous)
      ? previous
      : (years[0] || 'All');

    updateAccounts();
    render();
  };
})();
