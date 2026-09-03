// All Chart.js instances live here so theme refreshes and mutations stay
// in one place. Modules that need to re-render a chart import the updater
// directly and pass in fresh data.

import { formatCurrency, percentOfCost, escapeHtml } from './format.js';
import {
    getChartTextColor, getChartGridColor,
    getGainColor, getLossColor, getSurfaceColor,
} from './theme.js';

let profitLossChart = null;
let portfolioDistributionChart = null;
let yearlyProfitLossChart = null;

// Single-hue ramp ordered by position size, so the color itself encodes
// "biggest holding" instead of assigning arbitrary hues per ticker.
const DISTRIBUTION_RAMP = [
    '#0b3d3a', '#125a53', '#1c776c', '#2a9385',
    '#4aae9d', '#77c5b6', '#a6dbd0', '#d2ece6',
];

function signedColors(values) {
    const gain = getGainColor();
    const loss = getLossColor();
    return values.map(v => (v >= 0 ? gain : loss));
}

export function applyChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = getChartTextColor();
}

export function updateProfitLossChart(holdings) {
    const ctx = document.getElementById('profit-loss-chart');
    if (!ctx) return;

    const validHoldings = holdings.filter(h => h.profit_loss !== null && h.profit_loss !== undefined);
    if (validHoldings.length === 0) {
        if (profitLossChart) {
            profitLossChart.destroy();
            profitLossChart = null;
        }
        ctx.parentElement.innerHTML = '<p class="loading">Žádná data pro zobrazení</p>';
        return;
    }

    resizeProfitLossContainer(validHoldings.length, ctx);

    const sortedHoldings = [...validHoldings].sort((a, b) => (b.profit_loss || 0) - (a.profit_loss || 0));
    const labels = sortedHoldings.map(h => h.stock_name);
    const data = sortedHoldings.map(h => h.profit_loss || 0);

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Zisk/Ztráta (CZK)',
                data,
                backgroundColor: signedColors(data),
                borderWidth: 0,
                borderRadius: 2,
                borderSkipped: false,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: tooltipOptions({
                    label(context) {
                        const value = context.parsed.x;
                        const holding = sortedHoldings[context.dataIndex];
                        const percent = percentOfCost(value, holding.total_cost).toFixed(2);
                        return [`Zisk/Ztráta: ${formatCurrency(value)}`, `Procento: ${percent}%`];
                    },
                }),
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: getChartGridColor() },
                    ticks: {
                        color: getChartTextColor(),
                        callback: v => formatCurrency(v),
                    },
                },
                y: {
                    grid: { display: false },
                    ticks: { color: getChartTextColor() },
                },
            },
        },
    };

    if (profitLossChart) profitLossChart.destroy();
    profitLossChart = new Chart(ctx, config);
}

export function updatePortfolioDistributionChart(holdings) {
    const ctx = document.getElementById('portfolio-distribution-chart');
    if (!ctx) return;

    const valid = holdings.filter(h => h.total_value !== null && h.total_value !== undefined && h.total_value > 0);
    if (valid.length === 0) {
        if (portfolioDistributionChart) {
            portfolioDistributionChart.destroy();
            portfolioDistributionChart = null;
        }
        const legend = document.getElementById('portfolio-distribution-legend');
        if (legend) legend.innerHTML = '';
        ctx.parentElement.innerHTML = '<p class="loading">Žádná data pro zobrazení</p>';
        return;
    }

    const sorted = [...valid].sort((a, b) => (b.total_value || 0) - (a.total_value || 0));
    const labels = sorted.map(h => h.stock_name);
    const values = sorted.map(h => h.total_value || 0);

    const backgroundColors = values.map((_, i) => DISTRIBUTION_RAMP[i % DISTRIBUTION_RAMP.length]);

    // The full "ticker: 1 234,00 Kč (23.4%)" strings used to be Chart.js legend
    // entries and got clipped at the canvas edge. They render as real HTML
    // beside the canvas instead, which also makes them selectable.
    renderDistributionLegend(sorted, backgroundColors);

    const config = {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderColor: getSurfaceColor(),
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: tooltipOptions({
                    label(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = ((value / total) * 100).toFixed(1);
                        return [`${label}: ${formatCurrency(value)}`, `${pct}% portfolia`];
                    },
                }),
            },
        },
    };

    if (portfolioDistributionChart) portfolioDistributionChart.destroy();
    portfolioDistributionChart = new Chart(ctx, config);
}

export function updateYearlyProfitLossChart(yearlyData) {
    const ctx = document.getElementById('yearly-profit-loss-chart');
    if (!ctx) return;

    if (!yearlyData || yearlyData.length === 0) {
        if (yearlyProfitLossChart) {
            yearlyProfitLossChart.destroy();
            yearlyProfitLossChart = null;
        }
        ctx.parentElement.innerHTML = '<p class="loading">Žádné prodeje</p>';
        return;
    }

    const sorted = [...yearlyData].sort((a, b) => b.year - a.year);
    const labels = sorted.map(d => d.year.toString());
    const data = sorted.map(d => d.profit_loss || 0);

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Zisk/Ztráta (CZK)',
                data,
                backgroundColor: signedColors(data),
                borderWidth: 0,
                borderRadius: 2,
                borderSkipped: false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: tooltipOptions({
                    label(context) {
                        const value = context.parsed.y;
                        const yearData = sorted[context.dataIndex];
                        const pct = percentOfCost(value, yearData.total_cost).toFixed(2);
                        return [
                            `Zisk/Ztráta: ${formatCurrency(value)}`,
                            `Prodeje: ${formatCurrency(yearData.total_sales)}`,
                            `Náklady: ${formatCurrency(yearData.total_cost)}`,
                            `Procento: ${pct}%`,
                        ];
                    },
                }),
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: getChartGridColor() },
                    ticks: {
                        color: getChartTextColor(),
                        callback: v => formatCurrency(v),
                    },
                },
                x: {
                    grid: { display: false },
                    ticks: { color: getChartTextColor() },
                },
            },
        },
    };

    if (yearlyProfitLossChart) yearlyProfitLossChart.destroy();
    yearlyProfitLossChart = new Chart(ctx, config);
}

function renderDistributionLegend(sorted, colors) {
    const list = document.getElementById('portfolio-distribution-legend');
    if (!list) return;

    const total = sorted.reduce((sum, h) => sum + (h.total_value || 0), 0);
    list.innerHTML = sorted.map((h, i) => {
        const value = h.total_value || 0;
        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
        return `
            <div class="legend-row">
                <span class="legend-swatch" style="background:${colors[i]}" aria-hidden="true"></span>
                <span class="legend-name">${escapeHtml(h.stock_name)}</span>
                <span class="legend-value num">${formatCurrency(value)}</span>
                <span class="legend-pct num">${pct}%</span>
            </div>
        `;
    }).join('');
}

function tooltipOptions(callbacks) {
    return {
        backgroundColor: getSurfaceColor(),
        titleColor: getChartTextColor(),
        bodyColor: getChartTextColor(),
        borderColor: getChartGridColor(),
        borderWidth: 1,
        padding: 10,
        titleFont: { size: 13, weight: '600' },
        bodyFont: { size: 12 },
        callbacks,
    };
}

function resizeProfitLossContainer(barCount, ctx) {
    const isMobile = window.innerWidth <= 768;
    const heightPerBar = isMobile ? 40 : 50;
    const padding = isMobile ? 120 : 160;
    const minHeight = 300;
    const calculated = Math.max(minHeight, barCount * heightPerBar + padding);
    const container = ctx.closest('.chart-container');
    if (container) container.style.height = `${calculated}px`;
}

export function resizeProfitLossChartForWindow() {
    if (!profitLossChart || !profitLossChart.data || !profitLossChart.data.labels) return;
    const ctx = document.getElementById('profit-loss-chart');
    if (!ctx) return;
    resizeProfitLossContainer(profitLossChart.data.labels.length, ctx);
    profitLossChart.resize();
}

// Keep chart colors in sync with the current theme. Datasets are repainted
// too, not just the axes - gain/loss and the doughnut border are theme tokens.
document.addEventListener('themechange', () => {
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();
    if (typeof Chart !== 'undefined') Chart.defaults.color = textColor;

    [profitLossChart, portfolioDistributionChart, yearlyProfitLossChart].forEach(chart => {
        if (!chart) return;
        if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(scale => {
                if (scale.ticks) scale.ticks.color = textColor;
                if (scale.grid) scale.grid.color = gridColor;
            });
        }
        if (chart.options.plugins?.legend?.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }
        if (chart.options.plugins?.tooltip) {
            Object.assign(chart.options.plugins.tooltip, {
                backgroundColor: getSurfaceColor(),
                titleColor: textColor,
                bodyColor: textColor,
                borderColor: gridColor,
            });
        }
        chart.data.datasets.forEach(dataset => {
            if (chart === portfolioDistributionChart) {
                dataset.borderColor = getSurfaceColor();
            } else {
                dataset.backgroundColor = signedColors(dataset.data);
            }
        });
        chart.update();
    });
});

// Toggle chart/table view in the "Přehled zisků a ztrát" and
// "Zisk/Ztráta podle kalendářního roku" cards. Uses data-view attributes
// on the buttons, so no inline onclick is required in the template.
function initViewToggle(chartContainerId, tableContainerId, toggleSelector, onShowChart) {
    const chartContainer = document.getElementById(chartContainerId);
    const tableContainer = document.getElementById(tableContainerId);
    if (!chartContainer || !tableContainer) return;

    document.querySelectorAll(toggleSelector).forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            const showChart = view === 'chart';
            chartContainer.style.display = showChart ? 'block' : 'none';
            tableContainer.style.display = showChart ? 'none' : 'block';
            document.querySelectorAll(toggleSelector).forEach(b => {
                b.classList.toggle('active', b.dataset.view === view);
            });
            if (showChart && onShowChart) {
                setTimeout(onShowChart, 100);
            }
        });
    });
}

export function initChartToggles() {
    initViewToggle(
        'profit-loss-chart-container',
        'profit-loss-table-container',
        '[data-toggle="profit-loss"]',
        resizeProfitLossChartForWindow,
    );
    initViewToggle(
        'yearly-profit-loss-chart-container',
        'yearly-profit-loss-table-container',
        '[data-toggle="yearly-profit-loss"]',
        null,
    );
}
