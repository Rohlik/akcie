// Portfolio list: loads data, renders rows, supports session-only column sort,
// and triggers the distribution and position-bar redraws.

import { formatCurrency, formatSignedCurrency, formatNumber, escapeHtml } from './format.js';
import { setLoading, handleError } from './ui.js';
import { extractErrorMessage, readJson } from './api.js';
import { updateProfitLossChart, updatePortfolioDistributionChart } from './charts.js';

let currentHoldings = [];
let lastUpdatedAt = null;
const sortState = { key: null, direction: null };

function compareHoldingValues(a, b, direction) {
    const aIsNull = a === null || a === undefined;
    const bIsNull = b === null || b === undefined;
    if (aIsNull && bIsNull) return 0;
    if (aIsNull) return 1;
    if (bIsNull) return -1;
    let cmp;
    if (typeof a === 'string' && typeof b === 'string') {
        cmp = a.localeCompare(b, 'cs');
    } else {
        cmp = a - b;
    }
    return direction === 'desc' ? -cmp : cmp;
}

function getSortedHoldings() {
    const { key, direction } = sortState;
    if (!key || !direction) return currentHoldings;
    return [...currentHoldings].sort((a, b) => compareHoldingValues(a[key], b[key], direction));
}

function updateSortIndicators() {
    document.querySelectorAll('#holdings-table .cols [data-sort-key]').forEach(th => {
        const active = th.dataset.sortKey === sortState.key && sortState.direction;
        th.setAttribute('aria-sort', active
            ? (sortState.direction === 'asc' ? 'ascending' : 'descending')
            : 'none');
    });
}

function displayHoldings(holdings) {
    const tbody = document.getElementById('holdings-tbody');
    if (!tbody) return;

    if (holdings.length === 0) {
        tbody.innerHTML = '<div class="loading">Zatím žádné pozice. Přidejte první transakci.</div>';
        return;
    }

    tbody.innerHTML = holdings.map((holding, index) => {
        const historyId = `history-${index}`;
        const safeStock = escapeHtml(holding.stock_name);
        const plClass = holding.profit_loss !== null
            ? (holding.profit_loss >= 0 ? 'gain' : 'loss')
            : 'dim';
        const exempt = holding.three_year_quantity > 0;

        return `
            <div class="lot" data-stock="${safeStock}">
                <button type="button" class="rowbtn" data-action="toggle-history"
                        data-history-id="${historyId}" data-stock="${safeStock}"
                        aria-expanded="false" aria-controls="${historyId}">
                    <span class="tick">
                        <svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
                        ${safeStock}
                        ${exempt ? '<span class="pill" title="Prošlo tříletým časovým testem">3R</span>' : ''}
                        <span class="btn-rename" data-action="rename-stock" data-stock="${safeStock}"
                              role="button" tabindex="0" title="Přejmenovat ticker"
                              aria-label="Přejmenovat ticker ${safeStock}">✎</span>
                    </span>
                    <span class="m-qty">${formatNumber(holding.quantity)}</span>
                    <span class="m-hide gain">${holding.three_year_quantity ? formatNumber(holding.three_year_quantity) : '—'}</span>
                    <span class="m-hide dim">${formatCurrency(holding.average_purchase_price)}</span>
                    <span class="m-hide">${holding.current_price !== null ? formatCurrency(holding.current_price) : '<span class="dim">—</span>'}</span>
                    <span class="m-val">${holding.total_value !== null ? formatCurrency(holding.total_value) : '—'}</span>
                    <span class="m-pl ${plClass}">${holding.profit_loss !== null ? formatSignedCurrency(holding.profit_loss) : '—'}</span>
                </button>
                <div class="drawer" id="${historyId}" style="grid-template-rows: 0fr">
                    <div><div class="drawer-in">
                        <div class="history-content loading" data-history-for="${safeStock}">Načítání…</div>
                    </div></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderHoldings() {
    displayHoldings(getSortedHoldings());
    updateSortIndicators();
}

function handleHoldingsSort(key) {
    if (sortState.key === key) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.key = key;
        sortState.direction = 'asc';
    }
    renderHoldings();
}

function updatePortfolioTotals(holdings) {
    const priced = holdings.filter(h => h.total_value !== null && h.total_value !== undefined);
    const value = priced.reduce((sum, h) => sum + h.total_value, 0);
    const cost = priced.reduce((sum, h) => sum + (h.total_cost || 0), 0);
    const pl = value - cost;

    const valueEl = document.getElementById('portfolio-value');
    if (valueEl) valueEl.textContent = priced.length ? formatCurrency(value) : '—';

    const plEl = document.getElementById('portfolio-pl');
    if (plEl) {
        plEl.textContent = priced.length ? formatSignedCurrency(pl) : '—';
        plEl.className = pl >= 0 ? 'gain' : 'loss';
    }
}

function updateLastFetched(iso) {
    const el = document.getElementById('prices-updated');
    if (!el) return;

    if (!iso) {
        el.textContent = 'Ceny zatím nebyly načteny';
        el.classList.remove('stale');
        return;
    }

    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) {
        el.textContent = 'Ceny zatím nebyly načteny';
        return;
    }

    const stamp = when.toLocaleString('cs-CZ', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    const ageHours = (Date.now() - when.getTime()) / 36e5;
    el.innerHTML = `Ceny z Yahoo Finance · <span class="num">${escapeHtml(stamp)}</span>`;
    el.classList.toggle('stale', ageHours > 24);
    el.title = ageHours > 24
        ? 'Ceny jsou starší než 24 hodin'
        : '';
}

export function getAvailableSellQuantities() {
    const map = {};
    currentHoldings.forEach(h => { map[h.stock_name] = h.quantity; });
    return map;
}

export function repaintHoldingsCharts() {
    if (!currentHoldings.length) return;
    updateProfitLossChart(currentHoldings);
    updatePortfolioDistributionChart(currentHoldings);
}

export async function loadHoldings() {
    const tbody = document.getElementById('holdings-tbody');
    if (!tbody) return;
    setLoading('holdings-tbody', true);
    try {
        const response = await fetch('/api/holdings');
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Nepodařilo se načíst portfolio'));
        }

        currentHoldings = data.holdings;
        lastUpdatedAt = data.prices_updated_at || null;

        renderHoldings();
        updatePortfolioTotals(data.holdings);
        updateProfitLossChart(data.holdings);
        updatePortfolioDistributionChart(data.holdings);
        updateLastFetched(lastUpdatedAt);
    } catch (error) {
        handleError(error, 'Portfolio se nepodařilo načíst. Zkuste to znovu.');
        const el = document.getElementById('holdings-tbody');
        if (el) el.innerHTML = '<div class="error-text">Portfolio se nepodařilo načíst.</div>';
    } finally {
        setLoading('holdings-tbody', false);
    }
}

export function initHoldingsSort() {
    document.querySelectorAll('#holdings-table .cols [data-sort-key]').forEach(th => {
        const btn = th.querySelector('button') || th;
        btn.addEventListener('click', () => handleHoldingsSort(th.dataset.sortKey));
    });
}
