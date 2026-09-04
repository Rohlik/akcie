// Entry point: wires up the individual feature modules once the DOM is ready.

import { initTheme } from './theme.js';
import { initHoldingsSort, loadHoldings, repaintHoldingsCharts } from './holdings.js';
import { initTransactionInteractions } from './transactions.js';
import { loadTaxInfo, loadYearlyProfitLoss } from './tax.js';
import { initTransactionForm, initUpdatePricesButton } from './form.js';

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initHoldingsSort();
    initTransactionInteractions();
    initTransactionForm();
    initUpdatePricesButton();

    loadHoldings().then(loadTaxInfo);
    loadYearlyProfitLoss();

    // The distribution ring carries per-slice colors from the palette token,
    // which differs between themes, so it is redrawn rather than restyled.
    document.addEventListener('chartsneedrepaint', repaintHoldingsCharts);
});
