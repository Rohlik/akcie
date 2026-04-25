// Tax info card + yearly profit/loss table. Chart rendering is delegated to
// charts.js.

import { formatCurrency, formatPercentage, escapeHtml } from './format.js';
import { readJson, extractErrorMessage } from './api.js';
import { handleError } from './ui.js';
import { updateYearlyProfitLossChart } from './charts.js';

export async function loadTaxInfo() {
    if (!document.getElementById('tax-info-content')) return;
    try {
        const yearSelect = document.getElementById('tax-year-select');
        const selectedYear = (yearSelect && yearSelect.value && !Number.isNaN(parseInt(yearSelect.value, 10)))
            ? parseInt(yearSelect.value, 10)
            : new Date().getFullYear();

        const response = await fetch(`/api/tax-info?year=${encodeURIComponent(selectedYear)}`);
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to load tax info'));
        }

        if (yearSelect && Array.isArray(data.available_years)) {
            const years = data.available_years;
            const existing = Array.from(yearSelect.options)
                .map(o => parseInt(o.value, 10))
                .filter(v => !Number.isNaN(v));
            const same = existing.length === years.length && existing.every((v, i) => v === years[i]);
            if (!same) {
                yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
            }
            const toSelect = data.selected_year || selectedYear;
            yearSelect.value = String(toSelect);

            if (!yearSelect.dataset.initialized) {
                yearSelect.dataset.initialized = '1';
                yearSelect.addEventListener('change', () => loadTaxInfo());
            }
        }

        const salesEl = document.getElementById('current-year-sales');
        const salesValue = data.current_year_sales || 0;
        if (salesEl) {
            salesEl.textContent = formatCurrency(salesValue);
            if (salesValue > 0) {
                salesEl.style.color = 'var(--danger-color)';
                salesEl.style.fontWeight = '600';
            } else {
                salesEl.style.color = '';
                salesEl.style.fontWeight = '';
            }
        }

        const label1 = document.getElementById('tax-selected-year-label');
        const label2 = document.getElementById('tax-selected-year-label-2');
        if (label1) label1.textContent = data.selected_year || selectedYear;
        if (label2) label2.textContent = data.selected_year || selectedYear;

        document.getElementById('current-year-sales-three-years').textContent = formatCurrency(data.current_year_sales_three_years || 0);
        document.getElementById('remaining-capacity').textContent = formatCurrency(data.remaining_tax_free_capacity);
        document.getElementById('three-year-value').textContent = formatCurrency(data.three_year_total_value);
    } catch (error) {
        handleError(error, 'Chyba při načítání daňových informací: ' + error.message);
    }
}

function displayYearlyProfitLoss(yearlyData) {
    const tbody = document.getElementById('yearly-profit-loss-tbody');
    if (!tbody) return;

    if (!yearlyData || yearlyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Žádné prodeje</td></tr>';
        return;
    }

    const sorted = [...yearlyData].sort((a, b) => b.year - a.year);
    tbody.innerHTML = sorted.map(yr => {
        const pl = yr.profit_loss || 0;
        const pct = yr.total_cost > 0 ? (pl / yr.total_cost) * 100 : 0;
        const cls = pl >= 0 ? 'profit' : 'loss';
        return `
            <tr>
                <td><strong>${escapeHtml(yr.year)}</strong></td>
                <td>${formatCurrency(yr.total_sales)}</td>
                <td>${formatCurrency(yr.total_cost)}</td>
                <td class="${cls}">${formatCurrency(pl)}</td>
                <td class="${cls}">${formatPercentage(pct)}</td>
            </tr>
        `;
    }).join('');
}

export async function loadYearlyProfitLoss() {
    if (!document.getElementById('yearly-profit-loss-tbody')) return;
    try {
        const response = await fetch('/api/yearly-profit-loss');
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to load yearly profit/loss'));
        }
        displayYearlyProfitLoss(data.yearly_data);
        updateYearlyProfitLossChart(data.yearly_data);
    } catch (error) {
        handleError(error, 'Chyba při načítání ročních zisků/ztrát');
        const tbody = document.getElementById('yearly-profit-loss-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading">Chyba při načítání dat</td></tr>';
    }
}
