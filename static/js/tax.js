// Tax allowance ring, the year switch, and the yearly realised-gain bars.

import { formatCurrency, escapeHtml } from './format.js';
import { readJson, extractErrorMessage } from './api.js';
import { handleError } from './ui.js';
import { updateYearlyProfitLossChart } from './charts.js';
import { enhanceSelect } from './select.js';

// Past this many tax years the pills stop fitting the header, so the same
// control becomes a select. A long-running portfolio hits this eventually.
const MAX_PILLS = 5;
const RING_CIRCUMFERENCE = 2 * Math.PI * 60;

let selectedYear = null;

function renderYearSwitch(years, current) {
    const host = document.getElementById('year-switch');
    if (!host || !years.length) return;

    const signature = `${years.join(',')}|${current}|${years.length > MAX_PILLS}`;
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;

    if (years.length > MAX_PILLS) {
        host.classList.remove('years');
        host.classList.add('years-select');
        host.innerHTML = `
            <label class="visually-hidden" for="year-select">Daňový rok</label>
            <select id="year-select" class="year-select">
                ${years.map(y => `<option value="${y}" ${y === current ? 'selected' : ''}>Rok ${y}</option>`).join('')}
            </select>`;
        const select = host.querySelector('#year-select');
        select.addEventListener('change', event => {
            selectedYear = parseInt(event.target.value, 10);
            loadTaxInfo();
        });
        enhanceSelect(select, { label: 'Daňový rok' });
        return;
    }

    host.classList.remove('years-select');
    host.classList.add('years');
    host.innerHTML = years.map(y => `
        <button type="button" class="yr" data-year="${y}" aria-pressed="${y === current}">${y}</button>
    `).join('');
    host.querySelectorAll('.yr').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedYear = parseInt(btn.dataset.year, 10);
            loadTaxInfo();
        });
    });
}

function updateAllowanceRing(remaining, limit) {
    const used = Math.max(0, limit - remaining);
    const fraction = limit > 0 ? Math.min(1, used / limit) : 0;

    const ring = document.getElementById('allowance-ring');
    if (ring) {
        ring.setAttribute('stroke-dasharray',
            `${(fraction * RING_CIRCUMFERENCE).toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(2)}`);
        ring.setAttribute('stroke', remaining <= 0 ? 'var(--loss)' : 'var(--accent)');
        // A round cap on a zero-length dash still paints a dot, which reads as
        // "a sliver is used" when nothing is.
        ring.setAttribute('stroke-linecap', fraction > 0 ? 'round' : 'butt');
    }

    const pct = document.getElementById('allowance-ring-pct');
    if (pct) {
        pct.textContent = `${Math.round(fraction * 100)}%`;
        pct.setAttribute('fill', remaining <= 0 ? 'var(--loss)' : 'var(--accent)');
    }
}

export async function loadTaxInfo() {
    if (!document.getElementById('remaining-capacity')) return;
    try {
        const year = selectedYear || new Date().getFullYear();
        const response = await fetch(`/api/tax-info?year=${encodeURIComponent(year)}`);
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Nepodařilo se načíst daňové informace'));
        }

        selectedYear = data.selected_year || year;
        renderYearSwitch(data.available_years || [selectedYear], selectedYear);

        const limit = data.tax_free_limit || 0;
        const remaining = data.remaining_tax_free_capacity ?? 0;
        const taxable = data.current_year_sales || 0;
        const exempt = data.current_year_sales_three_years || 0;

        setText('remaining-capacity', formatCurrency(remaining));
        setText('remaining-capacity-2', formatCurrency(remaining));
        setText('tax-free-limit', formatCurrency(limit));
        setText('current-year-sales', formatCurrency(taxable));
        setText('sales-taxable', formatCurrency(taxable));
        setText('sales-exempt', formatCurrency(exempt));
        setText('current-year-sales-three-years', formatCurrency(exempt));
        setText('three-year-value', formatCurrency(data.three_year_total_value));
        setText('tax-selected-year-label', selectedYear);
        document.querySelectorAll('.tax-year-ref').forEach(el => { el.textContent = selectedYear; });

        updateAllowanceRing(remaining, limit);
        updateThreeYearShare(data.three_year_total_value);
    } catch (error) {
        handleError(error, 'Daňové informace se nepodařilo načíst.');
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateThreeYearShare(threeYearValue) {
    const el = document.getElementById('three-year-share');
    if (!el) return;
    const totalEl = document.getElementById('portfolio-value');
    const total = totalEl ? parseCzk(totalEl.textContent) : null;
    if (!total || !threeYearValue) {
        el.textContent = '—';
        return;
    }
    el.textContent = `${Math.round(threeYearValue / total * 100)} %`;
}

function parseCzk(text) {
    const digits = String(text).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(digits);
    return Number.isFinite(n) ? n : null;
}

export async function loadYearlyProfitLoss() {
    if (!document.getElementById('year-bars')) return;
    try {
        const response = await fetch('/api/yearly-profit-loss');
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Nepodařilo se načíst roční výsledky'));
        }
        updateYearlyProfitLossChart(data.yearly_data);
    } catch (error) {
        handleError(error, 'Roční výsledky se nepodařilo načíst.');
        const el = document.getElementById('year-bars');
        if (el) el.innerHTML = '<div class="error-text">Roční výsledky se nepodařilo načíst.</div>';
    }
}

export { escapeHtml };
