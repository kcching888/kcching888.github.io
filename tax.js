const GAS_URL = localStorage.getItem('ibkr_gas_url');

let allTrades = [];

async function loadTaxData() {
    if (!GAS_URL) {
        alert('Configure the Google Sheets Web App URL first.');
        return;
    }

    const response = await fetch(
        GAS_URL + '?action=getAll',
        { cache: 'no-store' }
    );

    const data = await response.json();

    allTrades = data.trades || [];

    populateYearOptions();
    renderCraCapitalGains();
}

function isHsbcAccount(account) {
    return /^\d{3}-\d{3}-\d{3}-\d{3}$/.test(String(account).trim());
}

function populateYearOptions() {
    const select = document.getElementById('f-cra-year');
    const years = new Set();

    allTrades.forEach(function(trade) {
        if (trade.date) {
            years.add(new Date(trade.date).getFullYear().toString());
        }
    });

    years.add(new Date().getFullYear().toString());

    select.innerHTML = Array.from(years)
        .sort()
        .reverse()
        .map(function(year) {
            return '<option value="' + year + '">' + year + '</option>';
        })
        .join('');

    select.value = new Date().getFullYear().toString();
}

function getCraCapitalGainsRows() {
    const year = document.getElementById('f-cra-year').value;
    const source = document.getElementById('f-cra-source').value;

    const sortedTrades = allTrades
        .slice()
        .sort(function(a, b) {
            return new Date(a.date) - new Date(b.date);
        });

    const positions = {};
    const results = [];

    sortedTrades.forEach(function(trade) {
        const symbol = String(trade.symbol || '').trim().toUpperCase();
        const account = String(trade.account || '').trim();
        const currency = String(trade.currency || '').trim().toUpperCase();
        const action = String(trade.action || '').trim().toLowerCase();

        const key = symbol + '|' + currency + '|' + account;

        if (!positions[key]) {
            positions[key] = {
                qty: 0,
                totalCost: 0
            };
        }

        const position = positions[key];

        const quantity = Math.abs(Number(trade.quantity) || 0);
        const amount = Math.abs(Number(trade.amount) || 0);
        const commission = Math.abs(
            Number(trade.commission ?? trade.comm) || 0
        );

        const rate = Number(trade.exchRate) || 1;

        // Landing is ignored for the original ACB calculation.
        if (action === 'landing') {
            return;
        }

        // Corporate Action Out: reduce shares, preserve cost.
        if (action.includes('corporate action out')) {
            position.qty = Math.max(0, position.qty - quantity);
            return;
        }

        // Corporate Action In: increase shares, preserve cost.
        if (action.includes('corporate action in')) {
            position.qty += quantity;
            return;
        }

        if (action.includes('buy')) {
            position.qty += quantity;
            position.totalCost += amount + commission;
            return;
        }

        if (action.includes('sell')) {
            if (position.qty <= 0) {
                return;
            }

            const sellQuantity = Math.min(quantity, position.qty);

            const averageCost = position.totalCost / position.qty;
            const acbCad = averageCost * sellQuantity * rate;

            const proceedsCad =
                (amount - commission) * rate;

            const capitalGainCad = proceedsCad - acbCad;

            const tradeYear = new Date(trade.date)
                .getFullYear()
                .toString();

            const selectedYear = document
                .getElementById('f-cra-year')
                .value;

            const isHsbc = isHsbcAccount(account);

            const matchesSource =
                source === 'ALL' ||
                (source === 'HSBC' && isHsbc) ||
                (source === 'IBKR' && !isHsbc);

            if (tradeYear === selectedYear && matchesSource) {
                results.push({
                    date: trade.date,
                    source: isHsbc ? 'HSBC' : 'IBKR',
                    account: account,
                    symbol: symbol,
                    currency: currency,
                    quantity: sellQuantity,
                    proceedsCad: proceedsCad,
                    acbCad: acbCad,
                    capitalGainCad: capitalGainCad
                });
            }

            position.qty -= sellQuantity;
            position.totalCost -= averageCost * sellQuantity;

            if (position.qty <= 0.000001) {
                position.qty = 0;
                position.totalCost = 0;
            }
        }
    });

    return results;
}
function renderCraCapitalGains() {
    const rows = getCraCapitalGainsRows();

    const tableRows = rows.map(function(trade) {
        const quantity = Math.abs(Number(trade.quantity) || 0);
        const amount = Math.abs(Number(trade.amount) || 0);
        const rate = Number(trade.exchRate) || 1;

        const proceedsCad = amount * rate;

        const acbCad = Number(trade.acbCad) || 0;
        const capitalGainCad = Number(trade.capitalGainCad) || 0;

        return `
            <tr>
                <td>${trade.date}</td>
                <td>${isHsbcAccount(trade.account) ? 'HSBC' : 'IBKR'}</td>
                <td>${trade.account}</td>
                <td>${trade.symbol}</td>
                <td class="text-right">${quantity}</td>
                <td class="text-right">${proceedsCad.toFixed(2)}</td>
                <td class="text-right">${acbCad.toFixed(2)}</td>
                <td class="text-right ${capitalGainCad >= 0 ? 'pos-gain' : 'pos-loss'}">
                    ${capitalGainCad.toFixed(2)}
</td>
            </tr>
        `;
    }).join('');

    document.getElementById('cra-table').innerHTML = `
        <div class="card">
            <h3>Annual Realized Capital Gains</h3>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Source</th>
                        <th>Account</th>
                        <th>Symbol</th>
                        <th class="text-right">Quantity</th>
                        <th class="text-right">Proceeds (CAD)</th>
                        <th class="text-right">ACB (CAD)</th>
                        <th class="text-right">Capital Gain / Loss (CAD)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
}

document.getElementById('f-cra-year')
    .addEventListener('change', renderCraCapitalGains);

document.getElementById('f-cra-source')
    .addEventListener('change', renderCraCapitalGains);

loadTaxData();
