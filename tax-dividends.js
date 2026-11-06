/* Foreign Dividends & Withholding — Review Worksheet

   Reads getAll's merged dividends array only.
   Does not modify capital-gains calculations or source records.
*/

(function () {
  'use strict';

  let worksheetRows = [];
  let host = null;
  let activeDividendCard = 'all';

  const annualRateCache = new Map();
  let fxMethod = 'daily';

  const number = value => {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ''
    ) {
      return null;
    }

    const n = Number(
      String(value).replace(/,/g, '').trim()
    );

    return Number.isFinite(n) ? n : null;
  };

  const text = value => String(value ?? '').trim();

  const escape = value => text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const format = value =>
    Number.isFinite(value)
      ? value.toLocaleString('en-CA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      : '—';

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
    return /WITHHOLD|WITHHELD/i.test(
      text(row.action)
    );
  }

  function isDividend(row) {
    return !isTax(row) && /DIV/i.test(
      text(row.action)
    );
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
    return values.every(value => value !== null)
      ? values.reduce(
          (sum, value) => sum + value,
          0
        )
      : null;
  }

  function eventKey(row) {
    return JSON.stringify([
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

    // Blank fees remain unknown; do not assume zero.
    if (raw === null) {
      return {
        native: null,
        cad: null
      };
    }

    if (raw === 0) {
      return {
        native: 0,
        cad: 0
      };
    }

    const fee = Math.abs(raw);
    const currency = text(row.currency).toUpperCase();
    const feeCurrency = text(
      row.feesCurrency || row.currency
    ).toUpperCase();

    let feeCad = number(row.feesCad);

    if (feeCad !== null) {
      feeCad = Math.abs(feeCad);
    }

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

  function taxRateOf(row) {
    const match = text(row.description).match(
      /(\d+(?:\.\d+)?)\s*%/
    );

    return match
      ? Number(match[1]) / 100
      : null;
  }

  function perShareTaxOf(row) {
    const n = number(row.price);

    return n !== null && n > 0 ? n : null;
  }

  function perShareDividendOf(row) {
    const description = text(row.description);

    const patterns = [
      /Cash Dividend\s+[A-Z]{3}\s+([\d.,]+)\s+per Share/i,
      /DIVIDEND\s+[A-Z]{3}\s+([\d.,]+)\s+PER SHARE/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);

      if (match) {
        const value = Number(
          match[1].replace(/,/g, '')
        );

        if (Number.isFinite(value) && value > 0) {
          return value;
        }
      }
    }

    return null;
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

      const candidates = taxes.filter(
        tax => eventKey(tax) === key
      );

      let matched = [];
      const reference = text(dividend.reference);

      if (reference) {
        const sameReference = candidates.filter(
          tax =>
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

      if (
        matched.length === 0 &&
        dividendGroups.get(key).length === 1 &&
        candidates.length === 1
      ) {
        matched = candidates;

        issues.push(
          'Withholding matched by account/date/symbol/CCY; source excluded'
        );
      }

      if (
        matched.length === 0 &&
        candidates.length > 0
      ) {
        const dividendPerShare =
          perShareDividendOf(dividend);

        const amountTolerance = 0.005;

        const amountMatches =
          dividendPerShare === null
            ? []
            : candidates.filter(tax => {
                const taxPerShare =
                  perShareTaxOf(tax);

                const taxRate = taxRateOf(tax);

                if (taxPerShare === null) {
                  return false;
                }

                // If the tax row states a rate, use it.
                if (taxRate !== null) {
                  return Math.abs(
                    taxPerShare -
                      dividendPerShare * taxRate
                  ) <= amountTolerance;
                }

                // Otherwise, accept only if this tax amount
                // is unique among the candidate tax rows.
                return candidates.filter(other => {
                  const otherTax =
                    perShareTaxOf(other);

                  return (
                    otherTax !== null &&
                    Math.abs(
                      otherTax - taxPerShare
                    ) <= amountTolerance
                  );
                }).length === 1;
              });

        if (amountMatches.length === 1) {
          matched = amountMatches;

          issues.push(
            'Withholding matched by per-share tax amount'
          );
        }
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

            return n === null
              ? null
              : Math.abs(n);
          }))
        : null;

      const withholdingCad = matched.length
        ? sumKnown(matched.map(row => {
            const n = cadValue(row);

            return n === null
              ? null
              : Math.abs(n);
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
        gross = amount;
        grossCad = amountCad;

        issues.push('Verify IBKR amount is gross');

        if (fees.native === null) {
          issues.push(
            'Bank fee not explicitly recorded'
          );
        }

        if (withholding === null) {
          const description = text(
            dividend.description
          );

          const isin = description.match(
            /\(([A-Z]{2}[A-Z0-9]{10})\)/
          );

          const isCanadian = Boolean(
            isin && isin[1].startsWith('CA')
          );

          const isReturnOfCapital =
            /RETURN OF CAPITAL/i.test(description);

          const matchingStatus =
            Number.isFinite(withholding)
              ? 'Tax matched'
              : isReturnOfCapital
                ? 'No tax expected — return of capital'
                : isCanadian
                  ? 'No tax expected — Canadian source'
                  : 'No tax matched — review';

          if (isReturnOfCapital) {
            issues.push(
              'Return of capital: withholding not expected'
            );
          } else if (isCanadian) {
            issues.push(
              'Canadian-source distribution: withholding not expected'
            );
          } else {
            issues.push(
              'No matched withholding: confirm whether tax was expected'
            );
          }
        }

        if (
          gross !== null &&
          withholding !== null &&
          fees.native !== null
        ) {
          net =
            gross - withholding - fees.native;
        }

        if (
          grossCad !== null &&
          withholdingCad !== null &&
          fees.cad !== null
        ) {
          netCad =
            grossCad -
            withholdingCad -
            fees.cad;
        }
      } else if (source === 'HSBC') {
        // HSBC amount is the net cash credited.
        net = amount;
        netCad = amountCad;

        // No paired tax: assume zero for gross reconstruction.
        // A paired tax with a missing value remains unknown.
        const taxForGross =
          matched.length === 0
            ? 0
            : withholding;

        const taxCadForGross =
          matched.length === 0
            ? 0
            : withholdingCad;

        if (matched.length === 0) {
          issues.push(
            'Gross uses zero assumed withholding: no tax record paired'
          );
        }

        if (fees.native === null) {
          issues.push(
            'Gross unresolved: native bank fee unavailable'
          );
        }

        if (fees.cad === null) {
          issues.push(
            'Gross CAD unresolved: CAD bank fee unavailable'
          );
        }

        if (
          net !== null &&
          taxForGross !== null &&
          fees.native !== null
        ) {
          gross =
            net + taxForGross + fees.native;
        }

        if (
          netCad !== null &&
          taxCadForGross !== null &&
          fees.cad !== null
        ) {
          grossCad =
            netCad +
            taxCadForGross +
            fees.cad;
        }
      } else {
        issues.push('Unknown source');
      }

      if (amount !== null && amount < 0) {
        issues.push(
          'Negative dividend: review reversal/correction'
        );
      }

      if (!dateOf(dividend)) {
        issues.push('Invalid date');
      }

      if (amountCad === null) {
        issues.push('Missing CAD value/FX');
      }

      if (
        dividend.requiresChargeReview === true ||
        /^(true|yes|1)$/i.test(
          text(dividend.requiresChargeReview)
        )
      ) {
        issues.push('Parser flagged charge review');
      }

      issues.push('Verify income classification');

      const description = text(
        dividend.description
      );

      const isin = description.match(
        /\(([A-Z]{2}[A-Z0-9]{10})\)/
      );

      const isCanadian = Boolean(
        isin && isin[1].startsWith('CA')
      );

      const isReturnOfCapital =
        /RETURN OF CAPITAL/i.test(description);

      const matchingStatus =
        Number.isFinite(withholding)
          ? 'Tax matched'
          : isReturnOfCapital
            ? 'No tax expected — return of capital'
            : isCanadian
              ? 'No tax expected — Canadian source'
              : 'No tax matched — review';

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
        feeAmount:
          number(dividend.fees) === null
            ? null
            : Math.abs(number(dividend.fees)),
        feeCurrency: text(
          dividend.feesCurrency || dividend.currency
        ).toUpperCase(),
        feeCad: fees.cad,
        pairedTaxCount: matched.length,
        importedFx: number(dividend.exchRate),
        net,
        currency: text(
          dividend.currency
        ).toUpperCase(),
        fx: number(dividend.exchRate),
        grossCad,
        withholdingCad,
        netCad,
        matchingStatus,
        reference:
          reference || text(dividend.statementKey),
        status: issues.join('; ')
      };
    });

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
          amount === null
            ? null
            : Math.abs(amount),
        fee: null,
        feeAmount: null,
        feeCurrency: text(
          tax.currency
        ).toUpperCase(),
        feeCad: null,
        pairedTaxCount: 0,
        importedFx: number(tax.exchRate),
        net: null,
        currency: text(tax.currency).toUpperCase(),
        fx: number(tax.exchRate),
        grossCad: null,
        withholdingCad:
          amountCad === null
            ? null
            : Math.abs(amountCad),
        netCad: null,
        matchingStatus: 'Unmatched tax record',
        reference:
          text(tax.reference) ||
          text(tax.statementKey),
        status:
          'Unmatched tax: review payment date, ' +
          'reference, duplicate/reversal status and ' +
          'income classification'
      });
    });

    const unresolvedSamples = output
      .filter(
        row =>
          row.classification !==
            'Unmatched withholding' &&
          !Number.isFinite(row.withholding)
      )
      .slice(0, 10)
      .map(row => ({
        date: row.date,
        source: row.source,
        account: row.account,
        symbol: row.symbol,
        currency: row.currency,
        gross: row.gross,
        description: row.description,
        status: row.status
      }));

    const dividendOutput = output.filter(
      row =>
        row.classification !==
        'Unmatched withholding'
    );

    const matchedWithholding = dividendOutput.filter(
      row => Number.isFinite(row.withholding)
    );

    const unresolvedWithholding =
      dividendOutput.filter(
        row => !Number.isFinite(row.withholding)
      );

    const unmatchedTax = output.filter(
      row =>
        row.classification ===
        'Unmatched withholding'
    );

    console.log('POST-MATCH DIAGNOSTIC', {
      dividendRows: dividendOutput.length,
      matchedWithholding:
        matchedWithholding.length,
      unresolvedWithholding:
        unresolvedWithholding.length,
      unmatchedTax: unmatchedTax.length,
      unresolvedSamples:
        unresolvedWithholding
          .slice(0, 10)
          .map(row => ({
            date: row.date,
            source: row.source,
            account: row.account,
            symbol: row.symbol,
            currency: row.currency,
            gross: row.gross,
            description: row.description,
            status: row.status
          }))
    });

    return output.sort(
      (a, b) =>
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
    ['matchingStatus', 'Withholding Match'],
    ['gross', 'Gross'],
    ['withholding', 'Withholding'],
    ['fee', 'Bank Fee'],
    ['net', 'Net Cash'],
    ['currency', 'CCY'],
    ['fx', 'Reporting FX Rate'],
    ['grossCad', 'Gross CAD'],
    ['withholdingCad', 'Withholding CAD'],
    ['netCad', 'Net Cash CAD'],
    ['feeCurrency', 'Fee CCY'],
    ['feeAmount', 'Fee Native'],
    ['feeCad', 'Fee CAD'],
    ['reportingFxMethod', 'Reporting FX Method'],
    ['reportingFxYear', 'Reporting FX Year'],
    ['importedFx', 'Imported FX Rate'],
    ['importedGrossCad', 'Imported Gross CAD'],
    [
      'importedWithholdingCad',
      'Imported Withholding CAD'
    ],
    ['importedNetCad', 'Imported Net CAD'],
    ['reference', 'Reference'],
    ['status', 'Review Status']
  ];

  const numeric = new Set([
    'gross',
    'withholding',
    'fee',
    'net',
    'fx',
    'grossCad',
    'withholdingCad',
    'netCad',
    'feeAmount',
    'feeCad',
    'importedFx',
    'importedGrossCad',
    'importedWithholdingCad',
    'importedNetCad'
  ]);

  function baseSelectedRows() {
    const year = host
      .querySelector('[data-year]')
      .value;

    const source = host
      .querySelector('[data-source]')
      .value;

    const account = host
      .querySelector('[data-account]')
      .value;

    return worksheetRows.filter(row =>
      (year === 'All' ||
        row.date.slice(0, 4) === year) &&
      (source === 'All' ||
        row.source === source) &&
      (account === 'All' ||
        row.account === account)
    );
  }

  function selectedRows() {
    return baseSelectedRows().map(reportingRow);
  }

  function annualRate(currency, year) {
    if (currency === 'CAD') return 1;

    return annualRateCache.get(year)
      ?.rates?.[currency] ?? null;
  }

  function annualValue(value, currency, year) {
    if (value === 0) return 0;

    const rate = annualRate(currency, year);

    return Number.isFinite(value) &&
      Number.isFinite(rate)
      ? value * rate
      : null;
  }

  function reportingRow(original) {
    const row = {
      ...original,
      importedGrossCad: original.grossCad,
      importedWithholdingCad:
        original.withholdingCad,
      importedNetCad: original.netCad,
      reportingFxMethod:
        fxMethod === 'annual'
          ? 'BOC annual average'
          : 'Imported transaction-date',
      reportingFxYear:
        original.date.slice(0, 4)
    };

    if (fxMethod !== 'annual') return row;

    const year = row.reportingFxYear;

    row.fx = annualRate(row.currency, year);
    row.grossCad = annualValue(
      row.gross,
      row.currency,
      year
    );

    row.withholdingCad = annualValue(
      row.withholding,
      row.currency,
      year
    );

    row.netCad = annualValue(
      row.net,
      row.currency,
      year
    );

    row.feeCad = annualValue(
      row.feeAmount,
      row.feeCurrency,
      year
    );

    if (
      row.source === 'HSBC' &&
      row.classification !==
        'Unmatched withholding'
    ) {
      const tax =
        row.pairedTaxCount === 0
          ? 0
          : row.withholdingCad;

      if (
        Number.isFinite(row.netCad) &&
        Number.isFinite(tax) &&
        Number.isFinite(row.feeCad)
      ) {
        row.grossCad =
          row.netCad + tax + row.feeCad;
      }
    }

    return row;
  }

  async function fetchAnnualRates(year) {
    if (annualRateCache.has(year)) return;

    annualRateCache.set(year, {
      state: 'loading'
    });

    try {
      const url =
        'https://www.bankofcanada.ca/valet/' +
        'observations/group/FX_RATES_ANNUAL/json' +
        '?start_date=' + year + '-01-01' +
        '&end_date=' + year + '-12-31';

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          'BOC HTTP ' + response.status
        );
      }

      const json = await response.json();

      const observation = (
        json.observations || []
      ).find(item =>
        String(item.d).slice(0, 4) === year
      );

      if (!observation) {
        throw new Error(
          'Annual rates not published for ' +
            year
        );
      }

      const rates = { CAD: 1 };

      Object.entries(observation).forEach(
        ([series, item]) => {
          const match = series.match(
            /^FXA([A-Z]{3})CAD$/
          );

          const rate = number(item?.v);

          if (
            match &&
            rate !== null &&
            rate > 0
          ) {
            rates[match[1]] = rate;
          }
        }
      );

      annualRateCache.set(year, {
        state: 'ready',
        rates
      });
    } catch (error) {
      annualRateCache.set(year, {
        state: 'error',
        message: error.message
      });
    }

    if (host?.isConnected) render();
  }

  function updateFxAvailability() {
    const year = host
      .querySelector('[data-year]')
      .value;

    const option = host.querySelector(
      '[data-fx] option[value="annual"]'
    );

    const note = host.querySelector(
      '[data-fx-note]'
    );

    let reason = '';

    if (year === 'All') {
      reason =
        'Select one completed year to use BOC annual averages.';
    } else if (
      Number(year) >= new Date().getFullYear()
    ) {
      reason =
        'Annual averages are disabled for the current or a future year.';
    } else {
      if (!annualRateCache.has(year)) {
        fetchAnnualRates(year);
      }

      const entry = annualRateCache.get(year);

      if (entry?.state === 'loading') {
        reason =
          'Loading published BOC annual rates…';
      } else if (entry?.state === 'error') {
        reason =
          'BOC rates unavailable: ' +
          entry.message +
          '. Transaction-date mode retained.';
      } else {
        const required = new Set(['CAD']);

        baseSelectedRows().forEach(row => {
          required.add(row.currency);

          if (
            Number.isFinite(row.feeAmount) &&
            row.feeAmount !== 0
          ) {
            required.add(row.feeCurrency);
          }
        });

        const missing = [...required].filter(
          currency =>
            annualRate(currency, year) === null
        );

        if (missing.length) {
          reason =
            'Annual rate missing for: ' +
            missing.join(', ');
        }
      }
    }

    option.disabled = Boolean(reason);

    host.querySelector('[data-fx-control]')
      .classList.toggle(
        'annual-unavailable',
        Boolean(reason)
      );

    const reset =
      reason && fxMethod === 'annual';

    if (reason) fxMethod = 'daily';

    host.querySelector('[data-fx]').value =
      fxMethod;

    note.textContent =
      (reset
        ? 'Switched to transaction-date mode. '
        : '') +
      (reason ||
        (fxMethod === 'annual'
          ? 'BOC ' + year +
            ' annual average; CAD per unit of foreign currency. Imported values preserved.'
          : 'Imported transaction-date CAD values/rates. BOC annual averages available for ' +
            year + '.'));
  }

  function currencyBreakdown(
    rows,
    amountKey,
    currencyKey = 'currency'
  ) {
    const totals = new Map();
    let missing = 0;

    rows.forEach(row => {
      if (!Number.isFinite(row[amountKey])) {
        missing++;
        return;
      }

      const currency =
        row[currencyKey] || 'Unknown';

      totals.set(
        currency,
        (totals.get(currency) || 0) +
          row[amountKey]
      );
    });

    return (
      '<div class="dividend-native-breakdown">' +
      [...totals.entries()]
        .sort(([a], [b]) =>
          a.localeCompare(b)
        )
        .map(([currency, amount]) =>
          '<div><span>' +
          escape(currency) +
          '</span><span>' +
          format(amount) +
          '</span></div>'
        )
        .join('') +
      (missing
        ? '<small>' + missing +
          ' native amounts unavailable</small>'
        : '') +
      '</div>'
    );
  }

  function updateAccounts() {
    const select = host.querySelector(
      '[data-account]'
    );

    const source = host
      .querySelector('[data-source]')
      .value;

    const previous = select.value;

    const accounts = [...new Set(
      worksheetRows
        .filter(
          row =>
            source === 'All' ||
            row.source === source
        )
        .map(row => row.account)
        .filter(Boolean)
    )].sort();

    select.replaceChildren(
      new Option('All accounts', 'All')
    );

    accounts.forEach(account =>
      select.add(new Option(account, account))
    );

    select.value = accounts.includes(previous)
      ? previous
      : 'All';
  }

  function buildSummary(rows) {
    const sum = key => rows.reduce(
      (total, row) =>
        Number.isFinite(row[key])
          ? total + row[key]
          : total,
      0
    );

    return {
      count: rows.length,
      grossCad: sum('grossCad'),
      withholdingCad: sum('withholdingCad'),
      netCad: sum('netCad'),
      feeCad: rows.reduce(
        (total, row) =>
          Number.isFinite(row.grossCad) &&
          Number.isFinite(row.withholdingCad) &&
          Number.isFinite(row.netCad)
            ? total +
              row.grossCad -
              row.withholdingCad -
              row.netCad
            : total,
        0
      ),
      unresolvedGross: rows.filter(
        row => row.gross === null
      ).length,
      unresolvedTax: rows.filter(
        row => row.withholding === null
      ).length,
      unmatchedTax: rows.filter(
        row =>
          row.classification ===
          'Unmatched withholding'
      ).length,
      reviewRows: rows.filter(
        row => text(row.status).length > 0
      ).length
    };
  }

  const dividendCardLabels = {
    all: 'All records',
    matched: 'Tax matched',
    withoutTax: 'Dividends without paired tax',
    unmatchedTax: 'Unmatched tax records',
    unresolvedGross: 'Gross amount missing'
  };

  function filterRowsByDividendCard(
    rows,
    filter = activeDividendCard
  ) {
    return rows.filter(row => {
      const isTaxRow =
        row.classification ===
        'Unmatched withholding';

      switch (filter) {
        case 'matched':
          return (
            !isTaxRow &&
            Number.isFinite(row.withholding)
          );

        case 'withoutTax':
          return (
            !isTaxRow &&
            !Number.isFinite(row.withholding)
          );

        case 'unmatchedTax':
          return isTaxRow;

        case 'unresolvedGross':
          return (
            !isTaxRow &&
            !Number.isFinite(row.grossCad)
          );

        case 'all':
        default:
          return true;
      }
    });
  }

  function renderSummary(rows) {
    const summaryContainer = host?.querySelector(
      '[data-summary]'
    );

    if (!summaryContainer) return;

    const validFilters = Object.keys(
      dividendCardLabels
    );

    if (!validFilters.includes(activeDividendCard)) {
      activeDividendCard = 'all';
    }

    const dividendRows = rows.filter(
      row =>
        row.classification !==
        'Unmatched withholding'
    );

    function totalAvailable(records, key) {
      const available = records.filter(row =>
        Number.isFinite(row[key])
      );

      return {
        amount: available.length
          ? available.reduce(
              (total, row) =>
                total + row[key],
              0
            )
          : null,
        available: available.length,
        missing: records.length -
          available.length
      };
    }

    // Include all available dividend gross amounts,
    // whether withholding is matched or not.
    const gross = totalAvailable(
      dividendRows,
      'grossCad'
    );

    const net = totalAvailable(
      dividendRows,
      'netCad'
    );

    // Includes both matched and standalone unmatched tax.
    const withholding = totalAvailable(
      rows,
      'withholdingCad'
    );

    const feeTotal = totalAvailable(
      dividendRows,
      'feeCad'
    );

    const summary = buildSummary(rows);

    const amountCards = [
      {
        label: 'Gross Dividend CAD',
        value: format(gross.amount),
        note: gross.missing
          ? `${gross.available} of ${dividendRows.length} ` +
            'dividends included; ' +
            `${gross.missing} gross ` +
            'amounts missing. Total incomplete.'
          : 'All dividend rows included, regardless of tax matching'
      },
      {
        label: 'Withholding Tax CAD',
        value: format(withholding.amount),
        note:
          'Available withholding, including unmatched tax records'
      },
      {
        label: 'Bank Fee CAD',
        value: format(feeTotal.amount),
        note:
          `${feeTotal.available} explicit fee values; ` +
          `${feeTotal.missing} unavailable`
      },
      {
        label: 'Net Cash CAD',
        value: format(net.amount),
        note: net.missing
          ? `${net.available} of ${dividendRows.length} ` +
            'dividends included; ' +
            `${net.missing} net ` +
            'amounts missing.'
          : 'All dividend rows included'
      }
    ];

    const countCards = [
      {
        label: 'All Records',
        filter: 'all',
        note:
          'Reset: show all records within year, source and account'
      },
      {
        label: 'Tax Matched',
        filter: 'matched',
        note:
          'Dividends with paired withholding'
      },
      {
        label: 'Dividends Without Paired Tax',
        filter: 'withoutTax',
        note:
          'Includes Canadian/ROC classifications and other unpaired dividends'
      },
      {
        label: 'Unmatched Tax Records',
        filter: 'unmatchedTax',
        note:
          'Standalone tax records not paired to a dividend'
      },
      {
        label: 'Gross Amount Missing',
        filter: 'unresolvedGross',
        note:
          'Dividends excluded from gross total because gross CAD is unavailable'
      }
    ];

    const nativeBreakdowns = [
      currencyBreakdown(
        dividendRows,
        'gross'
      ),
      currencyBreakdown(
        rows,
        'withholding'
      ),
      currencyBreakdown(
        dividendRows,
        'feeAmount',
        'feeCurrency'
      ),
      currencyBreakdown(
        dividendRows,
        'net'
      )
    ];

    const amountHtml = amountCards
      .map((card, index) => `
        <div class="summary-card">
          <div class="summary-label">
            ${escape(card.label)}
          </div>

          <div class="summary-value">
            ${escape(card.value)}
          </div>

          ${nativeBreakdowns[index]}

          <div class="summary-note">
            ${escape(card.note)}
          </div>
        </div>
      `)
      .join('');

    const countHtml = countCards.map(card => {
      const count = filterRowsByDividendCard(
        rows,
        card.filter
      ).length;

      const selected =
        activeDividendCard === card.filter;

      return `
        <button
          type="button"
          class="summary-card dividend-count-card${
            selected ? ' is-active' : ''
          }"
          data-dividend-filter="${
            escape(card.filter)
          }"
          aria-pressed="${selected}"
          title="Show corresponding records below"
        >
          <span class="summary-label">
            ${escape(card.label)}
          </span>

          <span class="summary-value">
            ${count.toLocaleString('en-CA')}
          </span>

          <span class="summary-note">
            ${escape(card.note)}
          </span>
        </button>
      `;
    }).join('');

    summaryContainer.innerHTML = `
      <div class="dividend-summary-row dividend-amount-row">
        ${amountHtml}
      </div>

      <div class="dividend-summary-row dividend-count-row">
        ${countHtml}
      </div>
    `;

    summaryContainer.onclick = function (event) {
      const button = event.target.closest(
        '[data-dividend-filter]'
      );

      if (
        !button ||
        !summaryContainer.contains(button)
      ) {
        return;
      }

      activeDividendCard =
        button.dataset.dividendFilter;

      render();
    };
  }

    function render() {
    updateFxAvailability();

    const baseRows = selectedRows();
    const rows = filterRowsByDividendCard(baseRows);

    // Keep summary counts based on year/source/account,
    // not on the clicked card.
    renderSummary(baseRows);

    const filterLabel =
      dividendCardLabels[activeDividendCard] ||
      dividendCardLabels.all;

    host.querySelector('[data-count]').textContent =
      `Showing ${rows.length} of ${baseRows.length} rows — ` +
      `${filterLabel}. ` +
      'Click “All Records” to show all records. ' +
      'Review worksheet only; totals are not filing-ready.';

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
      : `<tr>
          <td colspan="${columns.length}" class="empty">
            No dividend or withholding records for these filters.
          </td>
        </tr>`;
  }

  function exportCsv() {
    const rows = filterRowsByDividendCard(
      selectedRows()
    );

    const cell = value => {
      let output = String(value ?? '');

      if (
        typeof value === 'string' &&
        /^[=+\-@\t\r]/.test(output)
      ) {
        output = "'" + output;
      }

      return '"' +
        output.replace(/"/g, '""') +
        '"';
    };

    const csv = [
      columns.map(([, title]) => title),
      ...rows.map(row =>
        columns.map(([key]) => row[key])
      )
    ]
      .map(row => row.map(cell).join(','))
      .join('\r\n');

    const url = URL.createObjectURL(
      new Blob(['\uFEFF', csv], {
        type: 'text/csv;charset=utf-8;'
      })
    );

    const link = document.createElement('a');
    link.href = url;
    link.download =
      'Dividend_Withholding_Review.csv';
    link.click();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
  }

  function createUi() {
    host = document.createElement('section');
    host.className = 'card';
    host.id = 'foreign-dividend-worksheet';

    host.innerHTML = `
      <h2>
        Foreign Dividends &amp; Withholding —
        Review Worksheet
      </h2>

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

        <label data-fx-control>CAD Conversion
          <select data-fx>
            <option value="daily">
              Transaction-date rates
            </option>

            <option value="annual" disabled>
              BOC annual average
            </option>
          </select>
        </label>

        <button type="button" data-export>
          Export Review CSV
        </button>
      </div>

      <p
        class="status dividend-fx-note"
        data-fx-note
        aria-live="polite"
      ></p>

      <div class="summary-cards" data-summary></div>

      <p data-count class="status"></p>

      <div class="table-wrap">
        <table id="foreign-dividend-table">
          <thead>
            <tr>
              ${columns.map(([, title]) =>
                `<th>${escape(title)}</th>`
              ).join('')}
            </tr>
          </thead>

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

    host.querySelector('[data-fx]')
      .addEventListener('change', event => {
        fxMethod = event.target.value;
        render();
      });

    host.querySelector('[data-export]')
      .addEventListener('click', exportCsv);
  }

  window.loadForeignDividendWorksheet =
    function (records) {
      worksheetRows = buildRows(
        Array.isArray(records) ? records : []
      );

      if (!host) createUi();

      const yearSelect = host
        .querySelector('[data-year]');

      const previousYear = yearSelect.value;

      const years = [...new Set(
        worksheetRows
          .map(row => row.date.slice(0, 4))
          .filter(Boolean)
      )].sort().reverse();

      yearSelect.replaceChildren(
        new Option('All years', 'All')
      );

      years.forEach(year =>
        yearSelect.add(new Option(year, year))
      );

      yearSelect.value =
        years.includes(previousYear)
          ? previousYear
          : 'All';

      updateAccounts();
      render();
    };
})();

