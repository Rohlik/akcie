// All Chart.js instances live here so theme refreshes and mutations stay
// in one place. Modules that need to re-render a chart import the updater
// directly and pass in fresh data.

import { formatCurrency } from './format.js';
import { getChartTextColor, getChartGridColor } from './theme.js';

let profitLossChart = null;
let portfolioDistributionChart = null;
let yearlyProfitLossChart = null;

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
    const colors = data.map(v => v >= 0 ? '#10b981' : '#ef4444');

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Zisk/Ztráta (CZK)',
                data,
                backgroundColor: colors,
                borderColor: colors.map(c => c === '#10b981' ? '#059669' : '#dc2626'),
                borderWidth: 2,
                borderRadius: 8,
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
                        const percent = holding.total_cost > 0
                            ? ((value / holding.total_cost) * 100).toFixed(2)
                            : '0.00';
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
        ctx.parentElement.innerHTML = '<p class="loading">Žádná data pro zobrazení</p>';
        return;
    }

    const sorted = [...valid].sort((a, b) => (b.total_value || 0) - (a.total_value || 0));
    const labels = sorted.map(h => h.stock_name);
    const values = sorted.map(h => h.total_value || 0);

    const palette = [
        '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
    ];
    const backgroundColors = values.map((_, i) => palette[i % palette.length]);

    const config = {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderColor: '#ffffff',
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        color: getChartTextColor(),
                        font: { size: 12 },
                        generateLabels(chart) {
                            const d = chart.data;
                            const textColor = getChartTextColor();
                            if (d.labels.length && d.datasets.length) {
                                return d.labels.map((label, i) => {
                                    const value = d.datasets[0].data[i];
                                    const total = d.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const pct = ((value / total) * 100).toFixed(1);
                                    return {
                                        text: `${label}: ${formatCurrency(value)} (${pct}%)`,
                                        fontColor: textColor,
                                        fillStyle: d.datasets[0].backgroundColor[i],
                                        strokeStyle: d.datasets[0].borderColor,
                                        lineWidth: d.datasets[0].borderWidth,
                                        hidden: false,
                                        index: i,
                                    };
                                });
                            }
                            return [];
                        },
                    },
                },
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
    const colors = data.map(v => v >= 0 ? '#10b981' : '#ef4444');

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Zisk/Ztráta (CZK)',
                data,
                backgroundColor: colors,
                borderColor: colors.map(c => c === '#10b981' ? '#059669' : '#dc2626'),
                borderWidth: 2,
                borderRadius: 8,
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
                        const pct = yearData.total_cost > 0
                            ? ((value / yearData.total_cost) * 100).toFixed(2)
                            : '0.00';
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

function tooltipOptions(callbacks) {
    return {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 13 },
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

// Keep chart colors in sync with the current theme.
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
