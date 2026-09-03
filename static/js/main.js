// Entry point: wires up the individual feature modules once the DOM is ready.

import { initTheme } from './theme.js';
import { initHoldingsSort, loadHoldings } from './holdings.js';
import { initTransactionInteractions, loadRecentTransactions } from './transactions.js';
import { loadTaxInfo, loadYearlyProfitLoss } from './tax.js';
import { initChartToggles, resizeProfitLossChartForWindow, applyChartDefaults } from './charts.js';
import { initTransactionForm, initUpdatePricesButton } from './form.js';

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    applyChartDefaults();
    initChartToggles();
    initHoldingsSort();
    initTransactionInteractions();
    initTransactionForm();
    initUpdatePricesButton();

    loadHoldings();
    loadTaxInfo();
    loadYearlyProfitLoss();
    loadRecentTransactions();

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(resizeProfitLossChartForWindow, 250);
    });
});
