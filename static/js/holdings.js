// Portfolio ("Holdings") table: loads data, renders rows, supports
// session-only column sort, and triggers chart refreshes.

import {
    formatCurrency, formatSignedCurrency, formatNumber, formatPercentage,
    percentOfCost, escapeHtml,
} from './format.js';
import { setLoading, handleError } from './ui.js';
import { extractErrorMessage, readJson } from './api.js';
import { updateProfitLossChart, updatePortfolioDistributionChart } from './charts.js';

let currentHoldings = [];
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
    document.querySelectorAll('#holdings-table th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        const active = th.dataset.sortKey === sortState.key && sortState.direction;
        if (active) {
            th.classList.add(`sorted-${sortState.direction}`);
            th.setAttribute('aria-sort', sortState.direction === 'asc' ? 'ascending' : 'descending');
        } else {
            th.setAttribute('aria-sort', 'none');
        }
    });
}

function displayHoldings(holdings) {
    const tbody = document.getElementById('holdings-tbody');
    if (!tbody) return;

    if (holdings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Žádné akcie v portfoliu</td></tr>';
        return;
    }

    tbody.innerHTML = holdings.map((holding, index) => {
        const isThreeYear = holding.three_year_quantity > 0;
        const rowClass = isThreeYear ? 'three-year-holding' : '';
        const profitLossClass = holding.profit_loss !== null
            ? (holding.profit_loss >= 0 ? 'profit' : 'loss')
            : '';
        const historyId = `history-${index}`;
        const safeStock = escapeHtml(holding.stock_name);

        return `
            <tr class="${rowClass} holding-row" data-stock="${safeStock}" id="holding-row-${index}">
                <td>
                    <span class="stock-cell">
                        <button type="button" class="stock-name-clickable" data-action="toggle-history"
                                data-history-id="${historyId}" data-stock="${safeStock}"
                                aria-expanded="false" aria-controls="${historyId}">
                            ${safeStock} <span class="expand-icon" aria-hidden="true">▼</span>
                        </button>
                        <button type="button" class="btn-rename" data-action="rename-stock"
                                data-stock="${safeStock}" title="Přejmenovat ticker"
                                aria-label="Přejmenovat ticker ${safeStock}">✎</button>
                    </span>
                </td>
                <td>${formatNumber(holding.quantity)}</td>
                <td class="highlight-green">${formatNumber(holding.three_year_quantity)}</td>
                <td>${formatCurrency(holding.average_purchase_price)}</td>
                <td>${holding.current_price !== null ? formatCurrency(holding.current_price) : '<span class="unavailable">Nedostupné</span>'}</td>
                <td>${holding.total_value !== null ? formatCurrency(holding.total_value) : '-'}</td>
                <td class="${profitLossClass}">
                    ${holding.profit_loss !== null ? formatSignedCurrency(holding.profit_loss) : '-'}
                </td>
            </tr>
            <tr class="history-row" id="${historyId}" style="display: none;">
                <td colspan="7" class="history-cell">
                    <div class="history-content">
                        <h3>
                            Historie transakcí pro
                            <a href="https://finance.yahoo.com/quote/${encodeURIComponent(holding.stock_name)}"
                               target="_blank"
                               rel="noopener noreferrer">${safeStock}</a>
                        </h3>
                        <div id="history-content-${index}" class="loading">Načítání...</div>
                    </div>
                </td>
            </tr>
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

function displayProfitLoss(holdings) {
    const tbody = document.getElementById('profit-loss-tbody');
    if (!tbody) return;

    if (holdings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Žádná data</td></tr>';
        return;
    }

    tbody.innerHTML = holdings.map(holding => {
        if (holding.total_value === null || holding.total_cost === null) {
            return `
                <tr>
                    <td><strong>${escapeHtml(holding.stock_name)}</strong></td>
                    <td>-</td>
                    <td>${formatCurrency(holding.total_cost)}</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            `;
        }

        const profitLoss = holding.profit_loss || 0;
        const pct = percentOfCost(profitLoss, holding.total_cost);
        const cls = profitLoss >= 0 ? 'profit' : 'loss';
        return `
            <tr>
                <td><strong>${escapeHtml(holding.stock_name)}</strong></td>
                <td>${formatCurrency(holding.total_value)}</td>
                <td>${formatCurrency(holding.total_cost)}</td>
                <td class="${cls}">${formatSignedCurrency(profitLoss)}</td>
                <td class="${cls}">${formatPercentage(pct)}</td>
            </tr>
        `;
    }).join('');
}

export function getAvailableSellQuantities() {
    const map = {};
    currentHoldings.forEach(h => { map[h.stock_name] = h.quantity; });
    return map;
}

export async function loadHoldings() {
    const tbody = document.getElementById('holdings-tbody');
    if (!tbody) return;
    setLoading('holdings-tbody', true);
    try {
        const response = await fetch('/api/holdings');
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to load holdings'));
        }

        currentHoldings = data.holdings;
        renderHoldings();
        displayProfitLoss(data.holdings);
        updateProfitLossChart(data.holdings);
        updatePortfolioDistributionChart(data.holdings);
    } catch (error) {
        handleError(error, 'Chyba při načítání portfolia: ' + error.message);
        const tbody = document.getElementById('holdings-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">Chyba při načítání dat</td></tr>';
    } finally {
        setLoading('holdings-tbody', false);
    }
}

export function initHoldingsSort() {
    document.querySelectorAll('#holdings-table th.sortable').forEach(th => {
        const btn = th.querySelector('.sort-btn') || th;
        btn.addEventListener('click', () => {
            const key = th.dataset.sortKey;
            if (key) handleHoldingsSort(key);
        });
    });
}
