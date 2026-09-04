// Charts are hand-drawn SVG and CSS rather than a charting library: three
// simple figures did not justify a CDN dependency that cannot follow the
// theme tokens.

import { formatCurrency, formatSignedCurrency, percentOfCost, escapeHtml } from './format.js';
import { getChartPalette } from './theme.js';

const RADIUS = 62;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let tooltipEl = null;

function tooltip() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'tip';
        tooltipEl.hidden = true;
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

function showTip(html, event) {
    const tip = tooltip();
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    const rect = tip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
}

function hideTip() {
    if (tooltipEl) tooltipEl.hidden = true;
}

// --- Distribution ring --------------------------------------------------------

export function updatePortfolioDistributionChart(holdings) {
    const svg = document.getElementById('distribution-chart');
    const legend = document.getElementById('distribution-legend');
    const totalEl = document.getElementById('donut-total');
    if (!svg || !legend) return;

    const valued = holdings
        .filter(h => h.total_value !== null && h.total_value !== undefined && h.total_value > 0)
        .sort((a, b) => b.total_value - a.total_value);

    const total = valued.reduce((sum, h) => sum + h.total_value, 0);
    if (totalEl) totalEl.textContent = total > 0 ? formatCurrency(total) : '—';

    if (!valued.length) {
        svg.innerHTML = '<title>Rozložení portfolia podle pozice</title>';
        legend.innerHTML = '<div class="loading">Zatím žádné oceněné pozice</div>';
        return;
    }

    const palette = getChartPalette();
    let offset = 0;
    const slices = valued.map((h, i) => {
        const share = h.total_value / total;
        const slice = {
            name: h.stock_name,
            value: h.total_value,
            share,
            color: palette[i % palette.length],
            dash: `${(share * CIRCUMFERENCE - 2).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`,
            offset: (-offset * CIRCUMFERENCE).toFixed(2),
        };
        offset += share;
        return slice;
    });

    svg.innerHTML = `
        <title>Rozložení portfolia podle pozice</title>
        ${slices.map((s, i) => `
            <circle class="slice" data-i="${i}" cx="80" cy="80" r="${RADIUS}" fill="none"
                    stroke="${s.color}" stroke-width="19"
                    stroke-dasharray="${s.dash}" stroke-dashoffset="${s.offset}"
                    transform="rotate(-90 80 80)"></circle>`).join('')}
        <text x="80" y="76" text-anchor="middle" font-family="JetBrains Mono, monospace"
              font-size="16" font-weight="700" fill="var(--ink)">${escapeHtml(compact(total))}</text>
        <text x="80" y="92" text-anchor="middle" font-family="Archivo, sans-serif"
              font-size="8.5" letter-spacing="1.1" fill="var(--muted)">CELKEM</text>
    `;

    legend.innerHTML = slices.map((s, i) => `
        <div class="drow" data-i="${i}">
            <span class="sw" style="background: ${s.color}"></span>
            <span>${escapeHtml(s.name)}</span>
            <span class="dval">${formatCurrency(s.value)}</span>
            <span class="dpct">${(s.share * 100).toFixed(1)} %</span>
        </div>
    `).join('');

    // Hovering a slice or its legend row highlights both and reports the
    // position against the portfolio total.
    const link = (i, on) => {
        svg.querySelectorAll('.slice').forEach(el => el.classList.toggle('is-active', on && +el.dataset.i === i));
        legend.querySelectorAll('.drow').forEach(el => el.classList.toggle('is-active', on && +el.dataset.i === i));
    };

    const bind = (el) => {
        const i = +el.dataset.i;
        const s = slices[i];
        const body = `<b>${escapeHtml(s.name)}</b> · ${formatCurrency(s.value)}`
            + ` (${(s.share * 100).toFixed(1)} %)`
            + `<span class="tip-total">z ${formatCurrency(total)} celkem</span>`;
        el.addEventListener('mouseenter', e => { link(i, true); showTip(body, e); });
        el.addEventListener('mousemove', e => showTip(body, e));
        el.addEventListener('mouseleave', () => { link(i, false); hideTip(); });
    };

    svg.querySelectorAll('.slice').forEach(bind);
    legend.querySelectorAll('.drow').forEach(bind);

    // Hovering the ring but not a slice still answers "how much is this worth".
    const wrap = svg.closest('.donut-wrap');
    if (wrap && !wrap.dataset.bound) {
        wrap.dataset.bound = '1';
        wrap.addEventListener('mouseleave', hideTip);
    }
}

function compact(value) {
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
    return String(Math.round(value));
}

// --- Diverging bars -------------------------------------------------------------

function renderBars(container, rows) {
    if (!container) return;

    if (!rows.length) {
        container.className = 'bars';
        container.innerHTML = '<div class="loading">Zatím žádná data</div>';
        return;
    }

    // A series that contains losses gets a centre baseline, so a loss reads as
    // a loss rather than as a shorter win.
    const diverging = rows.some(r => r.value < 0);
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.value))) || 1;
    const scale = diverging ? 50 : 100;

    container.className = diverging ? 'bars diverging' : 'bars';
    container.innerHTML = rows.map(r => {
        const width = (Math.abs(r.value) / maxAbs * scale).toFixed(1);
        const side = r.value < 0 ? 'neg' : 'pos';
        const cls = r.value < 0 ? 'loss' : 'gain';
        const color = r.value < 0 ? 'var(--loss)' : 'var(--gain)';
        return `
            <div class="bar">
                <b title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</b>
                <span class="track"><i class="${side}" style="width: ${width}%; background: ${color}"></i></span>
                <em class="${cls}">${formatSignedCurrency(r.value)}</em>
            </div>`;
    }).join('');
}

export function updateProfitLossChart(holdings) {
    const rows = holdings
        .filter(h => h.profit_loss !== null && h.profit_loss !== undefined)
        .sort((a, b) => b.profit_loss - a.profit_loss)
        .map(h => ({ label: h.stock_name, value: h.profit_loss }));
    renderBars(document.getElementById('position-bars'), rows);
}

export function updateYearlyProfitLossChart(yearlyData) {
    const rows = (yearlyData || [])
        .slice()
        .sort((a, b) => b.year - a.year)
        .map(y => ({ label: String(y.year), value: y.profit_loss || 0 }));
    renderBars(document.getElementById('year-bars'), rows);
}

// Both figures read their colors from CSS tokens, so a theme switch only needs
// the ring repainted where the palette itself differs.
document.addEventListener('themechange', () => {
    hideTip();
    document.dispatchEvent(new CustomEvent('chartsneedrepaint'));
});

export { percentOfCost };
