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

    return allTrades
        .filter(function(trade) {
            if (String(trade.action).toLowerCase() !== 'sell') {
                return false;
            }

            const tradeYear = new Date(trade.date)
                .getFullYear()
                .toString();

            if (tradeYear !== year) {
                return false;
            }

            const isHsbc = isHsbcAccount(trade.account);

            if (source === 'IBKR' && isHsbc) {
                return false;
            }

            if (source === 'HSBC' && !isHsbc) {
                return false;
            }

            return true;
        });
}

function renderCraCapitalGains() {
    const rows = getCraCapitalGainsRows();

    const tableRows = rows.map(function(trade) {
        const quantity = Math.abs(Number(trade.quantity) || 0);
        const amount = Math.abs(Number(trade.amount) || 0);
        const rate = Number(trade.exchRate) || 1;

        const proceedsCad = amount * rate;

        return `
            <tr>
                <td>${trade.date}</td>
                <td>${isHsbcAccount(trade.account) ? 'HSBC' : 'IBKR'}</td>
                <td>${trade.account}</td>
                <td>${trade.symbol}</td>
                <td class="text-right">${quantity}</td>
                <td class="text-right">${proceedsCad.toFixed(2)}</td>
                <td class="text-right">TBD</td>
                <td class="text-right">TBD</td>
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
