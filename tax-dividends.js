/* Foreign Dividends & Withholding — Review Worksheet

   Reads getAll's merged dividends array only.
   Does not modify capital-gains calculations or source records.
*/

(function () {
  'use strict';

  let worksheetRows = [];
  let host = null;
  let activeDividendCard = 'all';
  let activeReconciliation = 'all';
  const reconciliationTolerance = 0.02;

  const annualRateCache = new Map();
  let fxMethod = 'daily';
  let stockTaxRuleMap = new Map();
  let stockTaxRulesProvided = false;

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

  function hasConfirmedZeroCollectionFee(row) {
    if (sourceOf(row) === 'IBKR') {
      return true;
    }

    if (sourceOf(row) !== 'HSBC') {
      return false;
    }

    const rule = stockTaxRuleMap.get(
      normalizeRuleSymbol(row.symbol)
    );

    return text(rule?.shareType).toUpperCase() ===
      'UNIT_TRUST';
  }

  function feeValues(row) {
    const raw = number(row.fees);

    // User-confirmed rule:
    // IBKR dividend collection has no fee.
    // Preserve any explicitly recorded fee.
    // Blank fees for other sources remain unknown.
    if (raw === null) {
      return hasConfirmedZeroCollectionFee(row)
        ? {
            native: 0,
            cad: 0
          }
        : {
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
        tax => !usedTaxes.has(tax) && eventKey(tax) === key
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
          'Withholding matched by source/account/date/symbol/CCY'
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
            ? (
                hasConfirmedZeroCollectionFee(dividend)
                  ? 0
                  : null
              )
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
    ['symbol', 'Symbol'],
    ['description', 'Description'],
    ['classification', 'Classification'],
    ['matchingStatus', 'Withholding Match'],
    ['shareType', 'Share Type'],
    ['expectedWithholdingPct', 'Expected Withholding %'],
    ['withholdingBasis', 'Withholding Basis'],
    ['withholdingExpectationSource', 'Expectation Source'],
    ['withholdingExpectationEvidence', 'Withholding Data Basis'],
    ['withholdingReview', 'Withholding Review'],
    ['expectedWithholdingNative', 'Expected Tax Native (Check Only)'],
    ['withholdingVarianceNative', 'Recorded Minus Expected Tax Native'],
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
    ['reportingFeeFxRate', 'Reporting Fee FX Rate'],
    ['importedFeeCad', 'Imported Fee CAD'],
    ['reportingFxReason', 'FX Fallback / Review Note'],
    ['importedGrossCad', 'Imported Gross CAD'],
    [
      'importedWithholdingCad',
      'Imported Withholding CAD'
    ],
    ['importedNetCad', 'Imported Net CAD'],
    ['reference', 'Reference'],
    ['reconciliationLabel', 'Reconciliation Category'],
    ['reconciliationDifferenceCad', 'Reconciliation Difference CAD'],
    ['reconciliationMissing', 'Missing CAD Components'],
    ['reconciliationBasis', 'Calculation Basis'],
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
    'reportingFeeFxRate',
    'importedFeeCad',
    'importedGrossCad',
    'importedWithholdingCad',
    'importedNetCad',
    'reconciliationDifferenceCad', 'expectedWithholdingPct',
    'expectedWithholdingNative', 'withholdingVarianceNative'
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

  function normalizeRuleSymbol(value) {
    const symbol = text(value).toUpperCase();
    const match = symbol.match(/^(\d{1,5})\.HK$/);
    return match ? match[1].padStart(5, '0') + '.HK' : symbol;
  }

  function loadStockTaxRules(rules) {
    const map = new Map();
    (Array.isArray(rules) ? rules : []).forEach(rule => {
      const symbol = normalizeRuleSymbol(rule.symbol);
      if (!symbol) return;
      const pct = number(rule.withdrawalTaxPct);
      if (pct !== null && (pct < 0 || pct >= 100)) {
        throw new Error('Invalid stock tax rule for ' + symbol);
      }
      if (map.has(symbol)) throw new Error('Duplicate stock tax rule: ' + symbol);
      map.set(symbol, { rate: pct, shareType: text(rule.shareType) || 'UNKNOWN' });
    });
    return map;
  }

  // Source policy: Stock_list is HSBC-only. IBKR uses uploaded records only.
  function ibkrUploadedWithholdingRow(original) {
    const row = { ...original };
    const isin = text(row.description).toUpperCase().match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/)?.[1];
    row.shareType = !isin ? 'UNKNOWN' : isin.startsWith('CA')
      ? 'Canadian security (inferred)' : isin.startsWith('US')
        ? 'US security (inferred)' : 'Other security (review)';
    row.expectedWithholdingPct = null;
    row.expectedWithholdingNative = null;
    row.withholdingVarianceNative = null;
    row.withholdingExpectationSource = 'IBKR_UPLOADED_RECORDS';
    row.withholdingExpectationEvidence = 'Uploaded IBKR withholding entries only; no Stock_list rate, country rate or account-type expectation.';
    row.withholdingExpectationInferred = false;
    row.withholdingExceptionReviewApplicable = false;
    row.withholdingReview = 'Not applicable — uploaded IBKR records only';
    // Keep uploaded unallocated tax as a separate amount, never discard it.
    if (row.classification === 'Unmatched withholding') {
      row.withholdingBasis = 'Uploaded IBKR withholding — separate tax record';
      row.matchingStatus = 'Separate uploaded withholding record';
      row.status = 'Uploaded IBKR withholding retained separately; no expected-rate review';
      return row;
    }
    const paired = row.pairedTaxCount > 0;
    const ambiguous = Boolean(row.ibkrWithholdingAllocationUnavailable) || /Ambiguous withholding match/i.test(text(row.status)+' '+text(row.matchingStatus));
    row.ibkrWithholdingAllocationUnavailable = ambiguous;
    const hasAmount = Number.isFinite(row.withholding) || Number.isFinite(row.withholdingCad);
    if (!paired && !ambiguous && !hasAmount) {
      row.withholding = 0;
      row.withholdingCad = 0;
      row.withholdingWasDerivedZero = true;
      row.withholdingBasis = 'No withholding entry in uploaded IBKR data';
      row.matchingStatus = 'No uploaded withholding entry';
    } else {
      row.withholdingBasis = paired || hasAmount
        ? 'Uploaded IBKR withholding amount'
        : 'Uploaded IBKR tax not allocated to this dividend';
      row.matchingStatus = paired ? 'Uploaded withholding matched'
        : hasAmount ? 'Uploaded withholding amount retained' : 'Uploaded tax allocation unavailable';
    }
    row.net = [row.gross,row.withholding,row.fee].every(Number.isFinite)
      ? row.gross - row.withholding - row.fee : null;
    row.netCad = [row.grossCad,row.withholdingCad,row.feeCad].every(Number.isFinite)
      ? row.grossCad - row.withholdingCad - row.feeCad : null;
    row.status = text(row.status).split('; ').filter(v =>
      !/No matched withholding: confirm whether tax was expected|Canadian-source distribution: withholding not expected|Return of capital: withholding not expected|Ambiguous withholding match|configured rate|Stock_list rule|Automatic account-level zero expectation/i.test(v)
    ).join('; ');
    return row;
  }

  function applyStockTaxRule(original) {
    if (text(original.source).toUpperCase() === 'IBKR') return ibkrUploadedWithholdingRow(original);
    if (text(original.source).toUpperCase() !== 'HSBC') return { ...original };
    const row = { ...original, withholdingExpectationSource:'STOCK_LIST', withholdingExceptionReviewApplicable:true };
    const rule = stockTaxRuleMap.get(normalizeRuleSymbol(row.symbol));
    row.shareType = rule?.shareType || 'UNKNOWN';
    row.expectedWithholdingPct = rule?.rate ?? null;
    row.withholdingExpectationSource = rule?.rate === null || rule?.rate === undefined ? 'UNCONFIGURED' : 'STOCK_LIST';
    row.withholdingBasis = 'Unknown';
    row.withholdingReview = 'No configured rate; review';
    row.expectedWithholdingNative = null;
    row.withholdingVarianceNative = null;
    if (row.classification === 'Unmatched withholding') {
      row.withholdingBasis = 'Standalone recorded tax';
      row.withholdingReview = 'Unmatched tax; dividend review required';
      return row;
    }
    const paired = row.pairedTaxCount > 0;
    const validTax = Number.isFinite(row.withholding);
    if (paired) {
      row.withholdingBasis = 'Paired tax record';
      row.withholdingReview = validTax ? 'Recorded tax; no configured rate' : 'Paired tax amount unavailable';
    } else if (rule?.rate === 0) {
      row.withholding = 0;
      row.withholdingCad = 0;
      row.withholdingBasis = 'Configured zero (Stock_list)';
      row.withholdingReview = 'Zero withholding — configured rule';
      row.matchingStatus = 'Zero withholding — configured rule; no paired tax';
      if (row.source === 'HSBC') {
        row.gross = Number.isFinite(row.net) && Number.isFinite(row.fee)
          ? row.net + row.fee : null;
        row.grossCad = Number.isFinite(row.netCad) && Number.isFinite(row.feeCad)
          ? row.netCad + row.feeCad : null;
      } else if (row.source === 'IBKR') {
        row.net = Number.isFinite(row.gross) && Number.isFinite(row.fee)
          ? row.gross - row.fee : null;
        row.netCad = Number.isFinite(row.grossCad) && Number.isFinite(row.feeCad)
          ? row.grossCad - row.feeCad : null;
      }
      row.status = text(row.status).split('; ')
        .filter(v => v !== 'Gross uses zero assumed withholding: no tax record paired' &&
          v !== 'No matched withholding: confirm whether tax was expected').join('; ');
      row.status += '; Zero tax uses Stock_list rule, not a statement-confirmed tax record';
    } else if (rule && rule.rate !== null && rule.rate > 0) {
      row.withholdingReview = 'Expected withholding missing';
      row.matchingStatus = 'Expected withholding missing (' + rule.rate + '% rule)';
      if (row.source === 'HSBC') {
        row.gross = null;
        row.grossCad = null;
      }
      row.status = text(row.status).split('; ')
        .filter(v => v !== 'Gross uses zero assumed withholding: no tax record paired').join('; ');
      row.status += '; Expected withholding missing; no estimated tax included';
    }
    if (paired && validTax && rule && rule.rate !== null && Number.isFinite(row.gross) && row.gross > 0) {
      row.expectedWithholdingNative = row.gross * rule.rate / 100;
      row.withholdingVarianceNative = row.withholding - row.expectedWithholdingNative;
      row.withholdingReview = Math.abs(row.withholdingVarianceNative) <= 0.02 + 1e-9
        ? 'Recorded tax matches configured rate (native tolerance 0.02)'
        : 'Recorded tax differs from configured rate';
    }
    return row;
  }

  function selectedRows() {
    return baseSelectedRows().map(reportingRow).map(annotateReconciliation);
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


  // Dividend FX v2: copies only; never overwrite imported records.
  function dividendFxRequirements(rows) {
    const required = new Set();
    rows.forEach(original => {
      const row = applyStockTaxRule(original);
      [['gross','currency'],['withholding','currency'],['net','currency'],['feeAmount','feeCurrency']].forEach(([amount,currency]) => {
        if (Number.isFinite(row[amount]) && row[amount] !== 0) required.add(text(row[currency]).toUpperCase() || '(unknown currency)');
      });
    });
    return [...required];
  }
  function dividendYearFxPlan(rows, year, requested, startFetch = true) {
    const daily = reason => ({method:'daily', requested, year, reason, rates:null});
    if (requested !== 'annual') return daily('');
    if (Number(year) >= new Date().getFullYear()) return daily('Current/future year: final annual average is not used.');
    const required = dividendFxRequirements(rows);
    if (required.every(currency => currency === 'CAD')) return {method:'annual', requested, year, reason:'', rates:{CAD:1}};
    if (!annualRateCache.has(year) && startFetch) fetchAnnualRates(year);
    const entry = annualRateCache.get(year);
    if (!entry || entry.state === 'loading') return daily('Annual rates loading; payment-date values temporarily retained.');
    if (entry.state === 'error') return daily('Annual-rate request failed: '+entry.message);
    const missing = required.filter(currency => !Number.isFinite(annualRate(currency,year)) || annualRate(currency,year) <= 0);
    if (missing.length) return daily('Annual rate unavailable for '+missing.join(', ')+'.');
    return {method:'annual', requested, year, reason:'', rates:Object.fromEntries(['CAD',...required].map(c => [c,annualRate(c,year)]))};
  }
  function dividendFxRow(original, method = 'daily', reason = '') {
    const base = applyStockTaxRule(original);
    const year = text(base.date).slice(0,4);
    const currency = text(base.currency).toUpperCase();
    const feeCurrency = text(base.feeCurrency || base.currency).toUpperCase();
    const row = {...base,
      importedGrossCad: original.grossCad, importedWithholdingCad: original.withholdingCad,
      importedFeeCad: original.feeCad, importedNetCad: original.netCad,
      importedFx: original.importedFx ?? original.fx,
      reportingFxMethod: method === 'annual' ? 'BOC annual average' : 'Imported payment-date',
      reportingFxYear: year, reportingFxReason: reason, reportingFeeFxRate: null
    };
    if (method !== 'annual') {
      row.reportingFeeFxRate = feeCurrency === 'CAD' ? 1 :
        (Number.isFinite(row.feeAmount) && row.feeAmount !== 0 && Number.isFinite(row.feeCad)
          ? row.feeCad / row.feeAmount : feeCurrency === currency ? number(row.fx) : null);
      return row;
    }
    row.fx = annualRate(currency,year);
    row.reportingFeeFxRate = annualRate(feeCurrency,year);
    row.grossCad = annualValue(base.gross,currency,year);
    row.withholdingCad = annualValue(base.withholding,currency,year);
    row.feeCad = annualValue(base.feeAmount,feeCurrency,year);
    row.netCad = annualValue(base.net,currency,year);
    if (base.classification !== 'Unmatched withholding') {
      if (base.source === 'HSBC') {
        const tax = Number.isFinite(row.withholdingCad) ? row.withholdingCad :
          base.pairedTaxCount === 0 && base.withholdingReview !== 'Expected withholding missing' ? 0 : null;
        row.grossCad = [row.netCad,tax,row.feeCad].every(Number.isFinite) ? row.netCad + tax + row.feeCad : null;
      } else if (base.source === 'IBKR') {
        row.netCad = [row.grossCad,row.withholdingCad,row.feeCad].every(Number.isFinite) ? row.grossCad - row.withholdingCad - row.feeCad : null;
      }
    }
    return row;
  }
  function reportingRow(original) {
    const year = text(original.date).slice(0,4);
    const plan = dividendYearFxPlan(baseSelectedRows(),year,fxMethod);
    return dividendFxRow(original,plan.method,plan.reason);
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
            row.pairedTaxCount > 0 &&
            Number.isFinite(row.withholding)
          );

        case 'withoutTax':
          return (
            !isTaxRow &&
            !(row.pairedTaxCount > 0)
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
    const container = host?.querySelector('[data-summary]');
    if (!container) return;

    if (
      !Object.prototype.hasOwnProperty.call(
        dividendCardLabels,
        activeDividendCard
      )
    ) {
      activeDividendCard = 'all';
    }

    const dividendRows = rows.filter(
      row => row.classification !== 'Unmatched withholding'
    );

    function availableTotal(records, key) {
      const known = records.filter(
        row => Number.isFinite(row[key])
      );

      return {
        amount: known.length
          ? known.reduce((sum, row) => sum + row[key], 0)
          : null,
        available: known.length,
        missing: records.length - known.length
      };
    }

    const amountDefinitions = [
      {
        label: 'Gross dividends',
        records: dividendRows,
        cadKey: 'grossCad',
        nativeKey: 'gross',
        currencyKey: 'currency'
      },
      {
        label: 'Withholding',
        records: rows,
        cadKey: 'withholdingCad',
        nativeKey: 'withholding',
        currencyKey: 'currency'
      },
      {
        label: 'Collection fees',
        records: dividendRows,
        cadKey: 'feeCad',
        nativeKey: 'feeAmount',
        currencyKey: 'feeCurrency'
      },
      {
        label: 'Net cash',
        records: dividendRows,
        cadKey: 'netCad',
        nativeKey: 'net',
        currencyKey: 'currency'
      }
    ];

    const amountRows = amountDefinitions.map(item => {
      const total = availableTotal(item.records, item.cadKey);

      return `
        <tr>
          <th scope="row">${escape(item.label)}</th>
          <td class="num">${escape(format(total.amount))}</td>
          <td class="dividend-native-cell">
            ${currencyBreakdown(
              item.records,
              item.nativeKey,
              item.currencyKey
            )}
          </td>
          <td class="num">
            ${total.missing.toLocaleString('en-CA')}
          </td>
        </tr>
      `;
    }).join('');

    const filterDefinitions = [
      ['all', 'All records'],
      ['matched', 'Tax paired'],
      ['withoutTax', 'No paired tax'],
      ['unmatchedTax', 'Unmatched tax'],
      ['unresolvedGross', 'Gross missing']
    ];

    const filterButtons = filterDefinitions.map(
      ([filter, label]) => {
        const count = filterRowsByDividendCard(
          rows,
          filter
        ).length;

        const selected = activeDividendCard === filter;

        return `
          <button
            type="button"
            class="dividend-filter-chip${selected ? ' is-active' : ''}"
            data-dividend-filter="${escape(filter)}"
            aria-pressed="${selected}"
          >
            <span>${escape(label)}</span>
            <span class="dividend-filter-count">
              ${count.toLocaleString('en-CA')}
            </span>
          </button>
        `;
      }
    ).join('');

    container.innerHTML = `
      <div class="dividend-summary-table-wrap">
        <table class="dividend-overview-table">
          <thead>
            <tr>
              <th scope="col">Amount</th>
              <th scope="col" class="num">Total CAD</th>
              <th scope="col">Native-currency breakdown</th>
              <th scope="col" class="num">Missing CAD amounts</th>
            </tr>
          </thead>
          <tbody>${amountRows}</tbody>
        </table>
      </div>

      <p class="dividend-compact-note">
        Totals sum available values only. Missing amounts are not zero.
        Withholding includes unmatched tax records.
        Fee breakdowns use each fee's own currency.
      </p>

      <div
        class="dividend-filter-toolbar"
        role="group"
        aria-label="Dividend record filters"
      >
        ${filterButtons}
      </div>
    `;

    container.onclick = event => {
      const button = event.target.closest(
        '[data-dividend-filter]'
      );

      if (!button || !container.contains(button)) return;

      activeDividendCard = button.dataset.dividendFilter;
      activeReconciliation = 'all';
      render();
    };
  }

    const reconciliationLabels = {
    all: 'All reconciliation records',
    balanced: 'Numerically balanced',
    difference: 'Reconciliation differences',
    assumed: 'HSBC assumed-zero withholding',
    incomplete: 'Incomplete dividends',
    expectedMissing: 'Expected withholding missing',
    ruleReview: 'Withholding rule differences',
    unmatched: 'Unmatched withholding',
    recordedTax: 'IBKR uploaded withholding — separate records'
  };

  function annotateReconciliation(row) {
    if (text(row.source).toUpperCase() === 'IBKR' && row.classification === 'Unmatched withholding') {
      const missingTax = ['withholding','withholdingCad'].filter(key => !Number.isFinite(row[key]));
      const category = missingTax.length ? 'incomplete' : 'recordedTax';
      return {...row,reconciliationCategory:category,reconciliationLabel:reconciliationLabels[category],
        reconciliationDifferenceCad:null,reconciliationMissing:missingTax.join('; '),
        reconciliationBasis:'Uploaded IBKR tax retained once in withholding totals; no expected-rate comparison or dividend equation.'};
    }
    const missing = ['grossCad', 'withholdingCad', 'feeCad', 'netCad']
      .filter(key => !Number.isFinite(row[key]));
    const assumed = row.source === 'HSBC' && row.pairedTaxCount === 0 &&
      row.withholdingBasis !== 'Configured zero (Stock_list)' && row.withholdingReview !== 'Expected withholding missing';
    const tax = assumed ? 0 : row.withholdingCad;
    const hasEquation = [row.grossCad, tax, row.feeCad, row.netCad]
      .every(Number.isFinite);
    const difference = hasEquation
      ? row.grossCad - tax - row.feeCad - row.netCad : null;
    let category;
    if (row.classification === 'Unmatched withholding') category = 'unmatched';
    else if (row.withholdingReview === 'Expected withholding missing') category = 'expectedMissing';
    else if (row.withholdingReview === 'Recorded tax differs from configured rate') category = 'ruleReview';
    else if (assumed) category = 'assumed';
    else if (missing.length) category = 'incomplete';
    else category = Math.abs(difference) <= reconciliationTolerance + 1e-9
      ? 'balanced' : 'difference';
    return { ...row,
      reconciliationCategory: category,
      reconciliationLabel: reconciliationLabels[category],
      reconciliationDifferenceCad: difference,
      reconciliationMissing: missing.join('; '),
      reconciliationBasis: category === 'unmatched' ? 'Standalone tax; no dividend equation'
        : row.source === 'HSBC' ? 'Gross reconstruction; see withholding basis and review status'
        : row.source === 'IBKR' ? 'Net derived from gross, tax and fee'
        : 'Worksheet values; statement verification required'
    };
  }

  function visibleReviewRows(rows) {
    const cardRows = filterRowsByDividendCard(rows);
    return activeReconciliation === 'all' ? cardRows
      : cardRows.filter(row => row.reconciliationCategory === activeReconciliation);
  }

    function renderReconciliation(rows) {
    const panel = host?.querySelector('[data-reconciliation]');
    if (!panel) return;

    const showEmpty = panel.dataset.showEmpty === 'true';

    const categories = Object.keys(reconciliationLabels)
      .filter(key => key !== 'all');

    const amountColumns = [
      ['grossCad', 'Gross CAD'],
      ['withholdingCad', 'Tax CAD'],
      ['feeCad', 'Fee CAD'],
      ['netCad', 'Net CAD']
    ];

    function displayLabel(category) {
      if (category === 'assumed') {
        return 'Assumed-zero withholding — HSBC fallback';
      }

      if (category === 'incomplete') {
        return 'Incomplete amounts';
      }

      return reconciliationLabels[category] || category;
    }

    function categoryDescription(category) {
      const descriptions = {
        balanced:
          'Available CAD components balance; this is not independent statement verification.',
        difference:
          'The absolute CAD reconciliation difference exceeds the worksheet tolerance.',
        assumed:
          'Legacy HSBC fallback: no paired tax record and zero tax used for gross reconstruction. Not a confirmed zero-tax rule.',
        incomplete:
          'At least one required CAD component is unavailable.',
        unmatched:
          'Standalone withholding without a paired dividend.',
        recordedTax:
          'Uploaded IBKR tax retained in totals without an expected-rate exception.'
      };

      return descriptions[category] || '';
    }

    function amountCell(records, key) {
      const known = records.filter(
        row => Number.isFinite(row[key])
      );

      const missing = records.length - known.length;

      const total = known.length
        ? known.reduce((sum, row) => sum + row[key], 0)
        : null;

      return `
        <td class="num">
          <span>${escape(format(total))}</span>
          ${missing
            ? `
              <small class="dividend-missing-count">
                ${missing.toLocaleString('en-CA')} missing
              </small>
            `
            : ''
          }
        </td>
      `;
    }

    const groups = categories.map(category => ({
      category,
      records: rows.filter(
        row => row.reconciliationCategory === category
      )
    }));

    const visibleGroups = groups.filter(group =>
      showEmpty ||
      group.records.length > 0 ||
      activeReconciliation === group.category
    );

    const emptyCount = groups.filter(
      group => group.records.length === 0
    ).length;

    const tableRows = visibleGroups.map(
      ({ category, records }) => {
        const selected = activeReconciliation === category;
        const description = categoryDescription(category);

        return `
          <tr class="${selected ? 'is-active' : ''}">
            <th scope="row">
              <button
                type="button"
                class="dividend-category-button"
                data-recon-filter="${escape(category)}"
                aria-pressed="${selected}"
              >
                ${escape(displayLabel(category))}
              </button>
              ${description
                ? `
                  <small class="dividend-category-description">
                    ${escape(description)}
                  </small>
                `
                : ''
              }
            </th>

            <td class="num">
              <button
                type="button"
                class="dividend-record-count"
                data-recon-filter="${escape(category)}"
                aria-label="${escape(
                  'Show ' + displayLabel(category)
                )}"
              >
                ${records.length.toLocaleString('en-CA')}
              </button>
            </td>

            ${amountColumns.map(
              ([key]) => amountCell(records, key)
            ).join('')}
          </tr>
        `;
      }
    ).join('');

    const ruleMessage =
      typeof stockTaxRuleMap !== 'undefined'
        ? `${stockTaxRuleMap.size.toLocaleString('en-CA')} HSBC Stock_list rules loaded.`
        : 'Configured Stock_list rules remain unchanged.';

    panel.innerHTML = `
      <div class="dividend-recon-heading">
        <h3>Dividend reconciliation</h3>

        <button
          type="button"
          class="dividend-reset-button"
          data-recon-filter="all"
          aria-pressed="${activeReconciliation === 'all'}"
        >
          Show all records
        </button>
      </div>

      <p class="dividend-compact-note">
        ${escape(ruleMessage)}
        ${rows.length.toLocaleString('en-CA')} records
        under the current year, source and account filters.
        FX: ${escape(
          fxMethod === 'annual'
            ? 'BOC annual average'
            : 'imported transaction-date values'
        )}.
      </p>

      <div class="dividend-recon-controls">
        <label>
          <input
            type="checkbox"
            data-show-empty-reconciliation
            ${showEmpty ? 'checked' : ''}
          >
          Show empty categories (${emptyCount})
        </label>
      </div>

      <div class="dividend-summary-table-wrap">
        <table class="dividend-reconciliation-table">
          <thead>
            <tr>
              <th scope="col">Review category</th>
              <th scope="col" class="num">Records</th>
              ${amountColumns.map(
                ([, label]) => `
                  <th scope="col" class="num">
                    ${escape(label)}
                  </th>
                `
              ).join('')}
            </tr>
          </thead>

          <tbody>
            ${tableRows || `
              <tr>
                <td colspan="6" class="empty">
                  No reconciliation records for these filters.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>

      <details class="dividend-calculation-details">
        <summary>Calculation and review notes</summary>

        <p>
          Difference = gross − withholding − fee − net.
          Tolerance: CAD ${escape(format(reconciliationTolerance))}
          per row. Gross or net may be derived, so numerical
          balance does not establish statement accuracy.
        </p>

        <p>
          Blank HSBC configured rates remain unresolved. IBKR uses uploaded withholding records only and has no expected-rate checks.
          Configured-zero withholding is different from
          assumed-zero withholding. Recorded tax and fee
          amounts are retained.
        </p>

        <p>
          Reconciliation categories are mutually exclusive.
          The record filters above are separate matching and
          completeness filters and can overlap.
        </p>

        <p>
          Selecting a reconciliation category resets the
          record filter. Selecting a record filter clears
          the reconciliation selection. CSV exports the
          displayed detail selection.
        </p>
      </details>
    `;

    panel.onclick = event => {
      const button = event.target.closest(
        '[data-recon-filter]'
      );

      if (!button || !panel.contains(button)) return;

      activeReconciliation = button.dataset.reconFilter;
      activeDividendCard = 'all';
      render();
    };

    panel.onchange = event => {
      if (
        !event.target.matches(
          '[data-show-empty-reconciliation]'
        )
      ) {
        return;
      }

      panel.dataset.showEmpty = String(event.target.checked);
      renderReconciliation(rows);
    };
  }

  const annualAmounts = ['grossCad', 'withholdingCad', 'feeCad', 'netCad'];

  function buildAnnualGroups(rows, detail = false) {
    const groups = new Map();
    rows.forEach(row => {
      const dimensions = [row.source || 'Unknown', row.account || 'Unknown',
        row.accountType || 'Unknown', row.classification || 'Unclassified',
        row.reconciliationCategory || 'incomplete', row.shareType || 'UNKNOWN', row.withholdingReview || 'Unknown'];
      if (detail) dimensions.push(row.symbol || 'Unknown', row.currency || 'Unknown');
      const key = JSON.stringify(dimensions);
      if (!groups.has(key)) groups.set(key, { dimensions, count: 0,
        amounts: Object.fromEntries(annualAmounts.map(k => [k, { total: 0, available: 0, missing: 0 }])) });
      const group = groups.get(key);
      group.count++;
      annualAmounts.forEach(k => {
        const stat = group.amounts[k];
        if (Number.isFinite(row[k])) { stat.total += row[k]; stat.available++; }
        else stat.missing++;
      });
    });
    return [...groups.values()].sort((a,b) => JSON.stringify(a.dimensions).localeCompare(JSON.stringify(b.dimensions)));
  }

  function annualTable(groups, detail) {
    const headings = ['Source', 'Account', 'Income classification (review)', 'Reconciliation category', 'Share type', 'Withholding review'];
    if (detail) headings.push('Symbol', 'Native CCY');
    headings.push('Records', 'Gross CAD', 'Withholding CAD', 'Fee CAD', 'Net CAD');
    return `<div class="table-wrap annual-income-table"><table><thead><tr>${headings.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${
      groups.length ? groups.map(group => {
        const labels = [...group.dimensions];

        // Translate the category before removing
        // the account-type display column.
        labels[4] =
          reconciliationLabels[labels[4]] ||
          labels[4];

        // Hide Account Type from the displayed table.
        labels.splice(2, 1);
        return `<tr>${labels.map(v => `<td>${escape(v)}</td>`).join('')}<td class="num">${group.count}</td>${annualAmounts.map(k => {
          const stat = group.amounts[k];
          return `<td class="num">${format(stat.available ? stat.total : null)}${stat.missing ? `<small>${stat.missing} unavailable</small>` : ''}</td>`;
        }).join('')}</tr>`;
      }).join('') : `<tr><td colspan="${headings.length}" class="empty">No records for these filters.</td></tr>`
    }</tbody></table></div>`;
  }

  function renderAnnualIncome(rows) {
    const panel = host.querySelector('[data-annual-income]');
    const year = host.querySelector('[data-year]').value;
    if (year === 'All') {
      panel.innerHTML = '<h3>Annual Dividend &amp; Withholding Summary</h3><p>Select one year in the dividend filters above to view and export the annual summary.</p>';
      return;
    }
    const dividends = rows.filter(r => r.classification !== 'Unmatched withholding');
    const standalone = rows.filter(r => r.classification === 'Unmatched withholding');
    const accountGroups = buildAnnualGroups(dividends);
    const securityGroups = buildAnnualGroups(dividends, true);
    const taxGroups = buildAnnualGroups(standalone, true);
    panel.innerHTML = `<h3>Annual Dividend &amp; Withholding Summary — ${escape(year)}</h3>
      <p>${dividends.length} dividend records; ${standalone.length} standalone withholding records. ${escape(fxMethod === 'annual' ? 'BOC annual-average reporting FX' : 'Imported transaction-date CAD values')}${Number(year) === new Date().getFullYear() ? ' · Current year: loaded records only, not a full-year forecast.' : '.'}</p>
      <p>Uses the dividend year/source/account filters, independently of clicked review cards. Subtotals are split by account, classification and reconciliation category; balanced does not mean statement-verified or tax-eligible. Account types and classifications remain review labels.</p>
      <button type="button" data-export-annual>Export Annual Dividend Summary CSV</button>
      <h4>By account, income classification and reconciliation category</h4>${annualTable(accountGroups, false)}
      <details><summary>Security breakdown (${securityGroups.length} groups)</summary>${annualTable(securityGroups, true)}</details>
      <details><summary>Standalone withholding — separate from dividend totals (${standalone.length} records)</summary>${annualTable(taxGroups, true)}</details>
      <p>Numbers sum available values only; unavailable values are not zero. Assumed-zero HSBC gross remains separately labelled. No income classifications or account-registration settings are confirmed by this report. This is a review summary, not a tax-return calculation.</p>`;
    panel.querySelector('[data-export-annual]').onclick = exportAnnualIncome;
  }

  function annualCsvText(rows, year) {
    const headers = ['Year','Reporting FX Method','Section','Source','Account','Account Type (Review)','Income Classification (Review)','Reconciliation Category','Share Type','Withholding Review','Symbol','Native Currency','Record Count'];
    annualAmounts.forEach(k => headers.push(k, k + ' Available Count', k + ' Missing Count'));
    const output = [headers];
    const method = fxMethod === 'annual' ? 'BOC annual average' : 'Imported transaction-date';
    [['Dividend by account',rows.filter(r => r.classification !== 'Unmatched withholding'),false],
     ['Dividend by security',rows.filter(r => r.classification !== 'Unmatched withholding'),true],
     ['Standalone withholding',rows.filter(r => r.classification === 'Unmatched withholding'),true]]
      .forEach(([section, records, detail]) => buildAnnualGroups(records, detail).forEach(group => {
        const d = group.dimensions;
        const line = [year,method,section,d[0],d[1],d[2],d[3],reconciliationLabels[d[4]] || d[4],d[5],d[6],detail ? d[7] : '',detail ? d[8] : '',group.count];
        annualAmounts.forEach(k => { const a=group.amounts[k]; line.push(a.available ? a.total : '',a.available,a.missing); });
        output.push(line);
      }));
    const cell = value => {
      let valueText = String(value ?? '');
      if (typeof value === 'string' && /^[=+\-@\t\r\n]/.test(valueText)) valueText = "'" + valueText;
      return '"' + valueText.replace(/"/g, '""') + '"';
    };
    return output.map(line => line.map(cell).join(',')).join('\r\n');
  }

  function exportAnnualIncome() {
    const year = host.querySelector('[data-year]').value;
    if (year === 'All') return;
    const url = URL.createObjectURL(new Blob(['\uFEFF', annualCsvText(selectedRows(), year)], {type:'text/csv;charset=utf-8;'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Annual_Dividend_Summary_' + year + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }

/* Insert inside the existing tax-dividends.js IIFE, before function render(). */
  let yearMatrixState = null;

  function renderYearMatrix() {
    if (!host) return;
    if (!yearMatrixState) {
      yearMatrixState = {
        tab: 'year', source: 'All', account: 'All', category: 'All',
        measure: 'grossCad', fxMode: 'annual', forecast: false, baseline: '', growth: 0,
        expanded: new Set(), drill: null
      };
      const detail = document.createElement('div');
      detail.dataset.matrixDetail = '';
      while (host.firstChild) detail.appendChild(host.firstChild);
      const nav = document.createElement('div');
      nav.className = 'ym-tabs';
      nav.innerHTML = '<button type="button" data-ym-tab="detail">Detailed Worksheet</button><button type="button" data-ym-tab="year">Yearly Review & Forecast</button>';
      const panel = document.createElement('section');
      panel.dataset.yearMatrix = '';
      host.append(nav, detail, panel);
      nav.onclick = e => {
        const button = e.target.closest('[data-ym-tab]');
        if (!button) return;
        yearMatrixState.tab = button.dataset.ymTab;
        renderYearMatrix();
      };
    }
    const s = yearMatrixState;
    const panel = host.querySelector('[data-year-matrix]');
    host.querySelector('[data-matrix-detail]').hidden = s.tab !== 'detail';
    panel.hidden = s.tab !== 'year';
    host.querySelectorAll('[data-ym-tab]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.ymTab === s.tab));
    });
    const now = new Date();
    const current = now.getFullYear();
    const validRows = worksheetRows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''));
          function category(row) {
      const source = text(row.source).toUpperCase();

      // IBKR: always classify from imported identifiers.
      // Do not consult Stock_list or configured ShareType.
      if (source === 'IBKR') {
        const candidates = [
          row.isin,
          row.ISIN,
          row.securityId,
          row.description
        ];

        let isin = '';

        for (const candidate of candidates) {
          const match = text(candidate)
            .toUpperCase()
            .match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);

          if (match) {
            isin = match[1];
            break;
          }
        }

        if (!isin) {
          return 'UNKNOWN';
        }

        switch (isin.slice(0, 2)) {
          case 'CA':
            return 'Canadian security — inferred';

          case 'US':
            return 'US security — inferred';

          default:
            return 'Other security — review';
        }
      }

      // Other sources, including HSBC:
      // preserve the existing configured categories.
      const rowType = text(row.shareType).toUpperCase();

      if (rowType && rowType !== 'UNKNOWN') {
        return rowType;
      }

      function normalizeSymbol(value) {
        const symbol = text(value).toUpperCase();
        const hk = symbol.match(/^(\d{1,5})\.HK$/);

        return hk
          ? hk[1].padStart(5, '0') + '.HK'
          : symbol;
      }

      if (
        typeof stockTaxRuleMap !== 'undefined' &&
        stockTaxRuleMap &&
        typeof stockTaxRuleMap.get === 'function'
      ) {
        const rule = stockTaxRuleMap.get(
          normalizeSymbol(row.symbol)
        );

        const configuredType = text(
          rule?.shareType
        ).toUpperCase();

        if (configuredType) {
          return configuredType;
        }
      }

      return 'UNKNOWN';
    }
    const source = r => r.source || 'Unknown source';
    const account = r => r.account || 'Unknown account';
    const unique = values => [...new Set(values)].sort();
    const sources = unique(validRows.map(source));
    if (s.source !== 'All' && !sources.includes(s.source)) s.source = 'All';
    const sourceRows = validRows.filter(r => s.source === 'All' || source(r) === s.source);
    const accounts = unique(sourceRows.map(account));
    if (s.account !== 'All' && !accounts.includes(s.account)) s.account = 'All';
    const accountRows = sourceRows.filter(r => s.account === 'All' || account(r) === s.account);
    const categories = unique(accountRows.map(category));
    if (s.category !== 'All' && !categories.includes(s.category)) s.category = 'All';
    const scopedOriginal = accountRows.filter(r => s.category === 'All' || category(r) === s.category);
    const years = unique(validRows.map(r => r.date.slice(0, 4)));
    const requestedFx = s.fxMode || 'annual';
    const yearFx = new Map(years.map(year => [year, dividendYearFxPlan(
      scopedOriginal.filter(r => r.date.slice(0,4) === year), year, requestedFx
    )]));
    const scoped = scopedOriginal.map(row => {
      const plan = yearFx.get(row.date.slice(0,4));
      return annotateReconciliation(dividendFxRow(row,plan.method,plan.reason));
    });
    const completed = years.filter(y => Number(y) < current);
    if (!completed.includes(s.baseline)) s.baseline = completed.at(-1) || '';
    if (!s.baseline) s.forecast = false;
    const measureLabels = {
      grossCad: 'Gross dividends', withholdingCad: 'Withholding',
      feeCad: 'Collection fees', netCad: 'Net cash', issues: 'Review issues — records'
    };
    const eligible = (rows, key) => key === 'withholdingCad'
      ? rows : rows.filter(r => r.classification !== 'Unmatched withholding');
    function stat(rows, key) {
      if (key === 'issues') {
        const annotated = rows.map(r => annotateReconciliation({...r}));
        return {value: annotated.filter(r => !['balanced','recordedTax'].includes(r.reconciliationCategory)).length, missing: 0, count: rows.length};
      }
      const records = eligible(rows, key);
      const known = records.filter(r => Number.isFinite(r[key]));
      return {
        value: known.length ? known.reduce((a,r) => a + r[key], 0) : null,
        missing: records.length - known.length, count: records.length
      };
    }
    const cutoff = scoped.filter(r => Number(r.date.slice(0,4)) === current && r.date <= [current, String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-')).map(r => r.date).sort().at(-1) || '';
    const columns = years.map(year => ({
      id: year,
      label: year + (Number(year) === current ? ' YTD' : ' Actual'),
      forecast: false, year
    }));
    if (s.forecast && s.measure !== 'issues') {
      columns.push({id: 'projected', label: current + ' full-year scenario', forecast: true});
      columns.push({id: 'forward', label: (current + 1) + ' baseline-repeat forecast', forecast: true});
    }
    function columnRows(rows, column) {
      if (!column.forecast) return rows.filter(r => r.date.slice(0,4) === column.year);
      const baselineRows = rows.filter(r => r.date.slice(0,4) === s.baseline);
      const scale = records => records.map(r => {
        const copy = {...r};
        ['grossCad','withholdingCad','feeCad','netCad'].forEach(k => {
          if (Number.isFinite(copy[k])) copy[k] *= 1 + s.growth / 100;
        });
        return copy;
      });
      if (column.id === 'forward') return scale(baselineRows);
      if (!cutoff) return null;
      const recorded = rows.filter(r => Number(r.date.slice(0,4)) === current && r.date <= cutoff);
      return recorded.concat(scale(baselineRows.filter(r => r.date.slice(5) > cutoff.slice(5))));
    }
    const tree = [{path: [], label: 'All selected sources — total', rows: scoped, level: 0, children: false}];
    for (const src of unique(scoped.map(source))) {
      const sr = scoped.filter(r => source(r) === src);
      const sp = [src];
      tree.push({path: sp, label: src, rows: sr, level: 0, children: true});
      for (const acc of unique(sr.map(account))) {
        const ar = sr.filter(r => account(r) === acc);
        const ap = [src,acc];
        tree.push({path: ap, label: acc, rows: ar, level: 1, children: true});
        for (const cat of unique(ar.map(category))) {
          tree.push({path: [src,acc,cat], label: cat, rows: ar.filter(r => category(r) === cat), level: 2, children: false});
        }
      }
    }
    const visible = tree.filter(node => node.path.length < 2 ||
      (s.expanded.has(JSON.stringify(node.path.slice(0,1))) &&
       (node.path.length < 3 || s.expanded.has(JSON.stringify(node.path.slice(0,2))))));
    const options = (values, selected, all) => (all ? '<option value="All">All</option>' : '') + values.map(v =>
      `<option value="${escape(v)}" ${v === selected ? 'selected' : ''}>${escape(v)}</option>`).join('');
    const select = (key, label, values, all = true) => `<label>${label}<select data-ym-field="${key}">${options(values,s[key],all)}</select></label>`;
    const data = [];
    function cell(node, column, index) {
      const records = columnRows(node.rows,column);
      const a = records === null ? {value:null,missing:0,count:0} : stat(records,s.measure);
      data.push({node,column,records,stat:a});
      const i = data.length - 1;
      const value = s.measure === 'issues' ? String(a.value ?? '—') : format(a.value);
      return `<td class="ym-num ${column.forecast ? 'ym-forecast' : ''}"><button type="button" data-ym-cell="${i}">${escape(value)}</button>${a.missing ? `<small>${a.missing} missing</small>` : ''}</td>`;
    }
    const totals = ['grossCad','withholdingCad','feeCad','netCad'].map(key => {
      const a = stat(scoped,key);
      return `<span>${escape(measureLabels[key])}: ${escape(format(a.value))}${a.missing ? ` (${a.missing} missing)` : ''}</span>`;
    }).join('');

        function renderFxYearHeading(column) {
      // Forecast headings retain their existing scenario labels.
      if (column.forecast) {
        return escape(column.label);
      }

      const plan = yearFx.get(column.year);

      if (!plan) {
        return escape(column.label);
      }

      // Show the APPLIED method, not merely the requested method.
      const annual = plan.method === 'annual';

      const method = annual
        ? 'BOC annual average'
        : 'Imported payment-date rates';

      const description = method +
        (plan.reason ? ' — ' + plan.reason : '');

      return `
        <span class="ym-fx-year-heading">
          <span
            class="ym-fx-box ${
              annual ? 'ym-fx-annual' : 'ym-fx-payment'
            }"
            title="${escape(description)}"
            role="img"
            aria-label="${escape(description)}"
          >${annual ? 'A' : 'P'}</span>

          <span>${escape(column.label)}</span>
        </span>
      `;
    }

    panel.innerHTML = `
      <h3>Yearly Review & Forecast</h3>
      <div class="ym-controls">
        ${select('source','Source',sources)}${select('account','Account',accounts)}${select('category','Category / ShareType',categories)}
        <label>Measure<select data-ym-field="measure">${Object.entries(measureLabels).map(([k,v]) => `<option value="${k}" ${s.measure === k ? 'selected' : ''}>${escape(v)}</option>`).join('')}</select></label>
        <label>Dividend CAD conversion
          <select data-ym-field="fxMode">
            <option value="daily" ${requestedFx === 'daily' ? 'selected' : ''}>Payment-date rates (imported)</option>
            <option value="annual" ${requestedFx === 'annual' ? 'selected' : ''}>BOC annual average — completed years</option>
          </select>
        </label>
        <button type="button" data-ym-action="retryFx">Reload annual rates</button>
        <label><input type="checkbox" data-ym-field="forecast" ${s.forecast ? 'checked' : ''} ${!s.baseline ? 'disabled' : ''}> Include forecasts</label>
        <button type="button" data-ym-action="expand">Expand all</button><button type="button" data-ym-action="collapse">Collapse all</button><button type="button" data-ym-action="export">Export matrix CSV</button>
      </div>
      <details class="ym-assumptions"><summary>Forecast assumptions</summary>
        <div class="ym-controls">${select('baseline','Baseline year',completed,false)}
          <label>Baseline amount change %<input type="number" min="-100" step="0.1" data-ym-field="growth" value="${s.growth}"></label>
        </div>
        <p>Baseline-repeat cash-flow scenario, not a holdings-based or tax-liability calculation. The percentage scales baseline gross, tax, fees and net equally; it does not recalculate current Stock_list tax rates. Historical CAD conversion is carried forward as a scenario assumption, not a future FX prediction. Missing baseline values remain missing.</p>
        <p>Current-year scenario = recorded amounts through the scope's latest loaded date + baseline payments after the same month/day. Cutoff: ${escape(cutoff || 'unavailable — current-year scenario disabled')}. Loaded records may be incomplete, and forecasts cannot establish completeness. Confirm baseline coverage before relying on estimates.</p>
      </details>
      <p class="ym-note">CAD · This tab has its own FX selector. ${requestedFx === 'annual' ? 'Completed years use annual averages only when all required rates for that year are available. Current/future years and unavailable-rate years retain imported payment-date values.' : 'Using imported payment-date CAD amounts; imported rates are not revalidated against BOC daily rates.'} Category is a grouping, not a verified tax classification. Existing withholding-review rules apply in both modes.</p>
            <div
        class="ym-fx-legend"
        role="group"
        aria-label="Dividend exchange-rate legend"
      >
        <span class="ym-fx-legend-title">FX basis:</span>

        <span class="ym-fx-legend-item">
          <span
            class="ym-fx-box ym-fx-annual"
            aria-hidden="true"
          >A</span>
          <span>BOC annual average</span>
        </span>

        <span class="ym-fx-legend-item">
          <span
            class="ym-fx-box ym-fx-payment"
            aria-hidden="true"
          >P</span>
          <span>Imported payment-date rates</span>
        </span>
      </div>

      ${
        requestedFx === 'annual' &&
        [...yearFx.values()].some(
          plan =>
            plan.method !== 'annual' &&
            Number(plan.year) < current &&
            plan.reason
        )
          ? `
            <p class="ym-note" role="status">
              Some completed years are temporarily using
              payment-date values because annual rates are
              loading or unavailable. Hover over their
              P boxes for details.
            </p>
          `
          : ''
      }
      <div class="ym-totals">Loaded-record totals across all displayed years: ${totals}</div>
      <div class="ym-scroll"><table class="ym-table"><thead><tr><th>Source → Account → Category</th>${columns.map(c => `<th class="${c.forecast ? 'ym-forecast' : ''}">${renderFxYearHeading(c)}</th>`).join('')}</tr></thead><tbody>
      ${visible.map(node => `<tr><th style="padding-left:${12 + node.level * 22}px">${node.children ? `<button type="button" data-ym-node="${escape(JSON.stringify(node.path))}" aria-expanded="${s.expanded.has(JSON.stringify(node.path))}">${s.expanded.has(JSON.stringify(node.path)) ? '−' : '+'} ${escape(node.label)}</button>` : escape(node.label)}</th>${columns.map(c => cell(node,c)).join('')}</tr>`).join('') || '<tr><td>No records</td></tr>'}
      </tbody></table></div><div data-ym-drill></div>`;
    panel.onchange = e => {
      const key = e.target.dataset.ymField;
      if (!key) return;
      if (key === 'forecast') s.forecast = e.target.checked;
      else if (key === 'growth') {
        const n = Number(e.target.value);
        s.growth = Number.isFinite(n) ? Math.max(-100,n) : 0;
      } else s[key] = e.target.value;
      if (key === 'source') {s.account = 'All'; s.category = 'All';}
      if (key === 'account') s.category = 'All';
      renderYearMatrix();
    };
    panel.onclick = e => {
      const toggle = e.target.closest('[data-ym-node]');
      if (toggle) {
        const key = toggle.dataset.ymNode;
        if (s.expanded.has(key)) s.expanded.delete(key); else s.expanded.add(key);
        renderYearMatrix(); return;
      }
      const action = e.target.closest('[data-ym-action]')?.dataset.ymAction;
      if (action === 'retryFx') {
        completed.forEach(year => annualRateCache.delete(year));
        if (requestedFx === 'annual') renderYearMatrix();
        else { completed.forEach(year => fetchAnnualRates(year)); renderYearMatrix(); }
        return;
      }
      if (action === 'expand' || action === 'collapse') {
        s.expanded.clear();
        if (action === 'expand') tree.filter(n => n.children).forEach(n => s.expanded.add(JSON.stringify(n.path)));
        renderYearMatrix(); return;
      }
      if (action === 'export') {
        const lines = [['Measure','Source','Account','Category','Column','Basis','Value','Missing','Records','Baseline','Change %','Cutoff','Requested FX','Applied FX','Year/Rate Details']];
        data.forEach(d => lines.push([measureLabels[s.measure],...Array.from({length:3},(_,i) => d.node.path[i] || ''),d.column.label,d.column.forecast ? 'Baseline-repeat scenario' : 'Loaded records',d.stat.value ?? '',d.stat.missing,d.stat.count,s.baseline,s.growth,cutoff,requestedFx,
          [...new Set((d.records || []).map(r => r.reportingFxMethod))].join(' + '),
          JSON.stringify([...new Set((d.records || []).map(r => r.reportingFxYear))].map(year => ({year,...yearFx.get(year)})))
        ]));
        const quote = v => {let t=String(v); if(typeof v === 'string' && /^[=+\-@\t\r\n]/.test(t)) t="'"+t; return '"'+t.replace(/"/g,'""')+'"';};
        const url = URL.createObjectURL(new Blob(['\uFEFF',lines.map(r => r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));
        const a=document.createElement('a'); a.href=url; a.download='Yearly_Dividend_Matrix.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); return;
      }
      const button = e.target.closest('[data-ym-cell]');
      if (!button) return;
      const d = data[Number(button.dataset.ymCell)];
      const target = panel.querySelector('[data-ym-drill]');
      if (d.column.forecast) {
        target.textContent = 'Forecast cell: baseline-repeat scenario. Expand Forecast assumptions above for its basis. It is not recorded tax paid.'; return;
      }
            const records = eligible(
        d.records || [],
        s.measure
      );

      const nativeFields = {
        grossCad: {
          amount: 'gross',
          currency: 'currency'
        },
        withholdingCad: {
          amount: 'withholding',
          currency: 'currency'
        },
        feeCad: {
          amount: 'feeAmount',
          currency: 'feeCurrency'
        },
        netCad: {
          amount: 'net',
          currency: 'currency'
        }
      };

      const nativeDefinition = nativeFields[s.measure];
      const isIssueView = s.measure === 'issues';

      const recordRows = records.map(row => {
        const reviewed = annotateReconciliation({
          ...row
        });

        const nativeAmount = nativeDefinition
          ? row[nativeDefinition.amount]
          : null;

        const nativeCurrency = nativeDefinition
          ? text(
              row[nativeDefinition.currency]
            ).toUpperCase()
          : '';

        const cadAmount = isIssueView
          ? null
          : row[s.measure];

        return `
          <tr>
            <td>${escape(row.date)}</td>
            <td>${escape(source(row))}</td>
            <td>${escape(account(row))}</td>
            <td>${escape(row.symbol)}</td>
            <td>${escape(category(row))}</td>

            <td>
              ${escape(nativeCurrency || '—')}
            </td>

            <td class="ym-num">
              ${escape(format(nativeAmount))}
            </td>

            <td class="ym-num">
              ${escape(format(cadAmount))}
            </td>

            <td>${escape(row.reportingFxMethod || '—')}</td>
            <td class="ym-num">${Number.isFinite(s.measure === 'feeCad' ? row.reportingFeeFxRate : row.fx) ? (s.measure === 'feeCad' ? row.reportingFeeFxRate : row.fx).toFixed(6) : '—'}</td>
            <td class="ym-num">${escape(format(row[({grossCad:'importedGrossCad',withholdingCad:'importedWithholdingCad',feeCad:'importedFeeCad',netCad:'importedNetCad'})[s.measure]]))}</td>
            <td>
              ${escape(
                reviewed.reconciliationLabel ||
                row.status ||
                '—'
              )}
            </td>
          </tr>
        `;
      }).join('');

      target.innerHTML = `
        <h4>
          ${escape(d.node.label)}
          · ${escape(d.column.label)}
          — ${escape(measureLabels[s.measure])}
        </h4>

        <p class="ym-note">
          ${
            isIssueView
              ? 'Review-issue view: no single monetary measure is selected.'
              : 'Native and CAD amounts show the selected measure. Collection fees use their own fee currency. Missing values remain unavailable, not zero.'
          }
        </p>

        <div class="ym-scroll">
          <table class="ym-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Account</th>
                <th>Symbol</th>
                <th>Category</th>
                <th>CCY</th>
                <th class="ym-num">Native amount</th>
                <th class="ym-num">Amount CAD</th>
                <th>Reporting FX method</th>
                <th class="ym-num">CAD per CCY unit</th>
                <th class="ym-num">Imported CAD</th>
                <th>Review</th>
              </tr>
            </thead>

            <tbody>
              ${
                recordRows ||
                `
                  <tr>
                    <td colspan="12">
                      No supporting records.
                    </td>
                  </tr>
                `
              }
            </tbody>
          </table>
        </div>
      `;    };
  }


  function render() {
    updateFxAvailability();

    const baseRows = selectedRows();
    const rows = visibleReviewRows(baseRows);

    // Keep summary counts based on year/source/account,
    // not on the clicked card.
    renderSummary(baseRows);
    renderReconciliation(baseRows);
    renderAnnualIncome(baseRows);

    const filterLabel =
      (activeReconciliation !== 'all' ? reconciliationLabels[activeReconciliation] : dividendCardLabels[activeDividendCard]) ||
      dividendCardLabels.all;

    host.querySelector('[data-count]').textContent =
      `Showing ${rows.length} of ${baseRows.length} rows — ` +
      `${filterLabel}. ` +
      'Click “All Records” or “Show all reconciliation records” to reset. ' +
      'Review worksheet only; totals are not filing-ready.';

        host.querySelector(
          '#foreign-dividend-table tbody'
        ).innerHTML = rows.length
      ? rows.map(row => `
          <tr>
            ${columns.map(([key]) => {
              let value = row[key];

              if (key === 'fx' || key === 'reportingFeeFxRate') {
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

        renderYearMatrix();    
  }

  function exportCsv() {
    const rows = visibleReviewRows(selectedRows());

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

      <section class="annual-income-panel" data-annual-income aria-label="Annual dividend summary"></section>
      <div class="summary-cards" data-summary></div>
      <section class="dividend-reconciliation" data-reconciliation aria-label="Dividend reconciliation"></section>

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

  window.getDividendReadinessSnapshot = function () {
    return worksheetRows.map(row =>
      annotateReconciliation(applyStockTaxRule({ ...row }))
    );
  };

  window.loadForeignDividendWorksheet =
    function (records, stockTaxRules) {
      stockTaxRulesProvided = Array.isArray(stockTaxRules);
      stockTaxRuleMap = loadStockTaxRules(stockTaxRules);
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

