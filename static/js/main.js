// =============================================
// Theme management (light / dark / auto)
// =============================================
const ThemeManager = (() => {
    // Possible modes stored in cookie: 'light', 'dark', 'auto'
    // 'auto' means follow OS preference.
    const COOKIE_NAME = 'theme';
    const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

    // Icons for each mode
    const ICONS = { light: '\u2600\uFE0F', dark: '\uD83C\uDF19', auto: '\uD83D\uDCBB' };
    // Labels (Czech)
    const LABELS = { light: 'Světlý', dark: 'Tmavý', auto: 'Auto' };
    // Tooltips (Czech)
    const TITLES = { light: 'Motiv: Světlý (klikněte pro tmavý)', dark: 'Motiv: Tmavý (klikněte pro automatický)', auto: 'Motiv: Automatický (klikněte pro světlý)' };
    // Cycle order: auto -> light -> dark -> auto ...
    const CYCLE = ['auto', 'light', 'dark'];

    let currentMode = window.__themeMode || 'auto';

    function getCookie() {
        const match = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/);
        return match ? match[1] : null;
    }

    function setCookie(value) {
        document.cookie = `${COOKIE_NAME}=${value};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
    }

    function resolveTheme(mode) {
        if (mode === 'light' || mode === 'dark') return mode;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    function updateIcon() {
        const iconEl = document.getElementById('theme-icon');
        const labelEl = document.getElementById('theme-label');
        const btn = document.getElementById('theme-toggle');
        if (iconEl) iconEl.textContent = ICONS[currentMode];
        if (labelEl) labelEl.textContent = LABELS[currentMode];
        if (btn) btn.title = TITLES[currentMode];
    }

    function isDark() {
        return resolveTheme(currentMode) === 'dark';
    }

    function getChartTextColor() {
        return isDark() ? '#cbd5e1' : '#374151';
    }

    function getChartGridColor() {
        return isDark() ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
    }

    function toggle() {
        const idx = CYCLE.indexOf(currentMode);
        currentMode = CYCLE[(idx + 1) % CYCLE.length];
        setCookie(currentMode);
        applyTheme(resolveTheme(currentMode));
        updateIcon();
        // Refresh charts with new theme colors
        refreshChartsTheme();
    }

    function init() {
        const saved = getCookie();
        currentMode = (saved === 'light' || saved === 'dark' || saved === 'auto') ? saved : 'auto';
        applyTheme(resolveTheme(currentMode));
        updateIcon();

        // Set Chart.js global text color to match current theme
        if (typeof Chart !== 'undefined') {
            Chart.defaults.color = getChartTextColor();
        }

        // Listen for OS theme changes (relevant when mode is 'auto')
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (currentMode === 'auto') {
                applyTheme(resolveTheme('auto'));
                refreshChartsTheme();
            }
        });

        // Attach toggle button
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.addEventListener('click', toggle);

        // Enable smooth transitions after initial paint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.add('theme-transition');
            });
        });
    }

    return { init, isDark, getChartTextColor, getChartGridColor, toggle };
})();

// Refresh all Chart.js charts with current theme colors
function refreshChartsTheme() {
    const textColor = ThemeManager.getChartTextColor();
    const gridColor = ThemeManager.getChartGridColor();

    // Update Chart.js global default so newly rendered elements pick up the color
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = textColor;
    }

    [profitLossChart, portfolioDistributionChart, yearlyProfitLossChart].forEach(chart => {
        if (!chart) return;
        // Update scale colors
        if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(scale => {
                if (scale.ticks) scale.ticks.color = textColor;
                if (scale.grid) scale.grid.color = gridColor;
            });
        }
        // Update legend colors
        if (chart.options.plugins?.legend?.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }
        chart.update();
    });
}

// CSRF token management
let csrfToken = null;

async function getCsrfToken() {
    if (!csrfToken) {
        try {
            const response = await fetch('/api/csrf-token');
            const data = await response.json();
            csrfToken = data.csrf_token;
        } catch (error) {
            console.error('Failed to get CSRF token:', error);
        }
    }
    return csrfToken;
}

// Loading state management
const loadingStates = new Set();

// Cached quantities for sell validation (current holdings)
let availableSellQuantities = {};

function setLoading(elementId, isLoading) {
    if (isLoading) {
        loadingStates.add(elementId);
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('loading');
            element.disabled = true;
        }
    } else {
        loadingStates.delete(elementId);
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('loading');
            element.disabled = false;
        }
    }
}

function showLoadingOverlay(show = true) {
    let overlay = document.getElementById('loading-overlay');
    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="spinner"></div><p>Načítání...</p>';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    } else {
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

// Format number as CZK currency
function formatCurrency(value) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: 'CZK',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

// Format number with thousand separators
function formatNumber(value) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('cs-CZ').format(value);
}

// Format percentage
function formatPercentage(value) {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// Show message to user
function showMessage(message, type = 'success') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(messageDiv, container.firstChild);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Error handler - wraps console.error for production
function handleError(error, userMessage) {
    // In production, you might want to send errors to a logging service
    if (process?.env?.NODE_ENV !== 'production') {
        console.error(error);
    }
    showMessage(userMessage || 'Došlo k chybě', 'error');
}

// Load and display holdings
async function loadHoldings() {
    setLoading('holdings-tbody', true);
    try {
        const response = await fetch('/api/holdings');
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to load holdings';
            throw new Error(errorMsg);
        }
        
        displayHoldings(data.holdings);
        displayProfitLoss(data.holdings);
        updateProfitLossChart(data.holdings);
        updatePortfolioDistributionChart(data.holdings);
    } catch (error) {
        handleError(error, 'Chyba při načítání portfolia: ' + error.message);
        document.getElementById('holdings-tbody').innerHTML = 
            '<tr><td colspan="7" class="loading">Chyba při načítání dat</td></tr>';
    } finally {
        setLoading('holdings-tbody', false);
    }
}

// Display holdings in table with expandable transaction history
function displayHoldings(holdings) {
    const tbody = document.getElementById('holdings-tbody');
    
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
        const rowId = `holding-row-${index}`;
        const historyId = `history-${index}`;
        
        return `
            <tr class="${rowClass} holding-row" data-stock="${holding.stock_name}" id="${rowId}">
                <td>
                    <strong class="stock-name-clickable" style="cursor: pointer; user-select: none;" onclick="toggleHistory('${historyId}', '${holding.stock_name}')">
                        ${holding.stock_name} <span class="expand-icon">▼</span>
                    </strong>
                </td>
                <td>${formatNumber(holding.quantity)}</td>
                <td class="highlight-green">${formatNumber(holding.three_year_quantity)}</td>
                <td>${formatCurrency(holding.average_purchase_price)}</td>
                <td>${holding.current_price !== null ? formatCurrency(holding.current_price) : '<span style="color: #999;">Nedostupné</span>'}</td>
                <td>${holding.total_value !== null ? formatCurrency(holding.total_value) : '-'}</td>
                <td class="${profitLossClass}">
                    ${holding.profit_loss !== null ? formatCurrency(holding.profit_loss) : '-'}
                </td>
            </tr>
            <tr class="history-row" id="${historyId}" style="display: none;">
                <td colspan="7" class="history-cell">
                    <div class="history-content">
                        <h4>
                            Historie transakcí pro
                            <a href="https://finance.yahoo.com/quote/${encodeURIComponent(holding.stock_name)}"
                               target="_blank"
                               rel="noopener noreferrer">
                                ${holding.stock_name}
                            </a>
                        </h4>
                        <div id="history-content-${index}" class="loading">Načítání...</div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Toggle transaction history (global function for onclick)
window.toggleHistory = async function(historyId, stockName) {
    const historyRow = document.getElementById(historyId);
    const isVisible = historyRow.style.display !== 'none';
    
    if (isVisible) {
        historyRow.style.display = 'none';
        // Update icon
        const icon = historyRow.previousElementSibling.querySelector('.expand-icon');
        if (icon) icon.textContent = '▼';
    } else {
        historyRow.style.display = 'table-row';
        // Update icon
        const icon = historyRow.previousElementSibling.querySelector('.expand-icon');
        if (icon) icon.textContent = '▲';
        
        // Load history if not loaded yet
        const contentDiv = historyRow.querySelector('.history-content div');
        if (contentDiv && contentDiv.textContent === 'Načítání...') {
            await loadStockHistory(stockName, contentDiv.id);
        }
    }
}

// Load transaction history for a specific stock
async function loadStockHistory(stockName, contentId) {
    try {
        const response = await fetch(`/api/transactions?stock=${encodeURIComponent(stockName)}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load history');
        }
        
        const transactions = data.transactions || [];
        const contentDiv = document.getElementById(contentId);
        
        if (transactions.length === 0) {
            contentDiv.innerHTML = '<p>Žádné transakce pro tuto akcii.</p>';
            return;
        }
        
        const historyHtml = `
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Typ</th>
                        <th>Cena (CZK)</th>
                        <th>Množství</th>
                        <th>Poplatky (CZK)</th>
                        <th>Celková hodnota</th>
                        <th style="width: 80px;">Akce</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map((tx, index) => {
                        const typeClass = tx.type === 'buy' ? 'profit' : 'loss';
                        const typeText = tx.type === 'buy' ? 'Nákup' : 'Prodej';
                        const fees = tx.fees || 0;
                        const totalValue = tx.type === 'buy' 
                            ? (tx.price * tx.quantity) + fees  // Buy: price + fees
                            : (tx.price * tx.quantity) - fees; // Sell: price - fees
                        const rowId = `tx-row-${tx.id}`;
                        
                        // Format date from YYYY-MM-DD to DD.MM.YYYY
                        const dateParts = tx.date.split('-');
                        const formattedDate = dateParts.length === 3 
                            ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`
                            : tx.date;
                        
                        return `
                            <tr id="${rowId}" data-tx-id="${tx.id}" data-tx-stock="${stockName}" data-tx-type="${tx.type}">
                                <td class="tx-date">${formattedDate}</td>
                                <td><span class="${typeClass}">${typeText}</span></td>
                                <td class="tx-price">${formatCurrency(tx.price)}</td>
                                <td class="tx-quantity">${formatNumber(tx.quantity)}</td>
                                <td class="tx-fees">${fees > 0 ? formatCurrency(fees) : '-'}</td>
                                <td class="tx-total">${formatCurrency(totalValue)}</td>
                                <td>
                                    <button class="btn-edit" onclick="editTransaction(${tx.id}, '${stockName}', '${contentId}')" title="Upravit">
                                        <span class="icon-pencil">✏️</span>
                                    </button>
                                    <button class="btn-delete" onclick="deleteTransaction(${tx.id}, '${stockName}', '${contentId}')" title="Smazat">
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        
        contentDiv.innerHTML = historyHtml;
    } catch (error) {
        console.error('Error loading stock history:', error);
        document.getElementById(contentId).innerHTML = '<p style="color: red;">Chyba při načítání historie.</p>';
    }
};

// Edit transaction function (global)
window.editTransaction = async function(transactionId, stockName, contentId) {
    try {
        // Get transaction data
        const response = await fetch(`/api/transactions?stock=${encodeURIComponent(stockName)}`);
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to load transaction';
            throw new Error(errorMsg);
        }
        
        const transaction = data.transactions.find(tx => tx.id === transactionId);
        if (!transaction) {
            showMessage('Transakce nenalezena', 'error');
            return;
        }
        
        const row = document.querySelector(`tr[data-tx-id="${transactionId}"]`);
        if (!row) return;
        
        // Check if already in edit mode
        if (row.classList.contains('edit-mode')) {
            return;
        }
        
        // Store original values
        row.dataset.originalDate = transaction.date;
        row.dataset.originalPrice = transaction.price;
        row.dataset.originalQuantity = transaction.quantity;
        row.dataset.originalFees = transaction.fees || 0;
        
        // Convert to edit mode
        row.classList.add('edit-mode');
        
        // Parse date from YYYY-MM-DD to DD.MM.YYYY for display
        const dateParts = transaction.date.split('-');
        const displayDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
        
        row.innerHTML = `
            <td>
                <input type="text" class="edit-date" value="${displayDate}" placeholder="DD.MM.YYYY" style="width: 100px;">
            </td>
            <td><span class="${transaction.type === 'buy' ? 'profit' : 'loss'}">${transaction.type === 'buy' ? 'Nákup' : 'Prodej'}</span></td>
            <td>
                <input type="number" class="edit-price" value="${transaction.price}" step="0.01" min="0" style="width: 100px;">
            </td>
            <td>
                <input type="number" class="edit-quantity" value="${transaction.quantity}" min="1" style="width: 80px;">
            </td>
            <td>
                <input type="number" class="edit-fees" value="${transaction.fees || 0}" step="0.01" min="0" style="width: 100px;">
            </td>
            <td class="tx-total">-</td>
            <td>
                <button class="btn-save" onclick="saveTransaction(${transactionId}, '${stockName}', '${contentId}')" title="Uložit">✓</button>
                <button class="btn-cancel" onclick="cancelEditTransaction(${transactionId}, '${stockName}', '${contentId}')" title="Zrušit">✕</button>
            </td>
        `;
        
        // Initialize date picker for edit mode
        const dateInput = row.querySelector('.edit-date');
        if (dateInput) {
            flatpickr(dateInput, {
                locale: 'cs',
                dateFormat: 'd.m.Y',
                altInput: false,
                altFormat: 'd.m.Y',
                firstDayOfWeek: 1,
                defaultDate: transaction.date,
                allowInput: true,
                parseDate: (datestr, format) => {
                    const parts = datestr.split('.');
                    if (parts.length === 3) {
                        const day = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10) - 1;
                        const year = parseInt(parts[2], 10);
                        return new Date(year, month, day);
                    }
                    return null;
                },
                formatDate: (date, format) => {
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${day}.${month}.${year}`;
                },
                onChange: function(selectedDates, dateStr, instance) {
                    if (selectedDates.length > 0) {
                        const date = selectedDates[0];
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        dateInput.setAttribute('data-iso-date', `${year}-${month}-${day}`);
                    }
                }
            });
        }
        
        // Add change listeners to update total value
        const updateTotal = () => {
            const price = parseFloat(row.querySelector('.edit-price').value) || 0;
            const quantity = parseInt(row.querySelector('.edit-quantity').value) || 0;
            const fees = parseFloat(row.querySelector('.edit-fees').value) || 0;
            const total = transaction.type === 'buy' 
                ? (price * quantity) + fees
                : (price * quantity) - fees;
            row.querySelector('.tx-total').textContent = formatCurrency(total);
        };
        
        row.querySelector('.edit-price').addEventListener('input', updateTotal);
        row.querySelector('.edit-quantity').addEventListener('input', updateTotal);
        row.querySelector('.edit-fees').addEventListener('input', updateTotal);
        updateTotal();
        
    } catch (error) {
        console.error('Error editing transaction:', error);
        showMessage('Chyba při úpravě transakce: ' + error.message, 'error');
    }
};

// Save transaction function (global)
window.saveTransaction = async function(transactionId, stockName, contentId) {
    try {
        const row = document.querySelector(`tr[data-tx-id="${transactionId}"]`);
        if (!row) return;
        
        // Get values from inputs
        const dateInput = row.querySelector('.edit-date');
        let dateValue = dateInput.getAttribute('data-iso-date');
        if (!dateValue) {
            // Parse DD.MM.YYYY format
            const dateStr = dateInput.value;
            const parts = dateStr.split('.');
            if (parts.length === 3) {
                dateValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                throw new Error('Neplatný formát data');
            }
        }
        
        const price = parseFloat(row.querySelector('.edit-price').value);
        const quantity = parseInt(row.querySelector('.edit-quantity').value);
        const fees = parseFloat(row.querySelector('.edit-fees').value) || 0;
        
        // Validate
        if (!dateValue || price <= 0 || quantity <= 0 || fees < 0) {
            showMessage('Neplatné hodnoty', 'error');
            return;
        }
        
        // Update transaction
        const token = await getCsrfToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['X-CSRFToken'] = token;
        }
        
        const response = await fetch(`/api/transaction/${transactionId}`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                date: dateValue,
                price: price,
                quantity: quantity,
                fees: fees
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to update transaction';
            throw new Error(errorMsg);
        }
        
        showMessage('Transakce byla úspěšně aktualizována', 'success');
        
        // Reload transaction history
        await loadStockHistory(stockName, contentId);
        
        // Reload holdings and tax info
        await Promise.all([loadHoldings(), loadTaxInfo(), loadYearlyProfitLoss()]);
        
    } catch (error) {
        handleError(error, 'Chyba při ukládání transakce: ' + error.message);
    }
};

// Delete transaction function (global)
window.deleteTransaction = async function(transactionId, stockName, contentId) {
    if (!confirm('Opravdu chcete smazat tuto transakci? Tato akce je nevratná.')) {
        return;
    }
    
    try {
        const token = await getCsrfToken();
        const headers = {};
        if (token) {
            headers['X-CSRFToken'] = token;
        }
        
        const response = await fetch(`/api/transaction/${transactionId}`, {
            method: 'DELETE',
            headers: headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to delete transaction';
            throw new Error(errorMsg);
        }
        
        showMessage('Transakce byla úspěšně smazána', 'success');
        
        // Reload transaction history
        await loadStockHistory(stockName, contentId);
        
        // Reload holdings and tax info
        await Promise.all([loadHoldings(), loadTaxInfo(), loadYearlyProfitLoss()]);
        
    } catch (error) {
        handleError(error, 'Chyba při mazání transakce: ' + error.message);
    }
};

// Cancel edit function (global)
window.cancelEditTransaction = async function(transactionId, stockName, contentId) {
    // Reload transaction history to restore original view
    await loadStockHistory(stockName, contentId);
};

// Chart instances
let profitLossChart = null;
let portfolioDistributionChart = null;
let yearlyProfitLossChart = null;

// Display profit/loss table
function displayProfitLoss(holdings) {
    const tbody = document.getElementById('profit-loss-tbody');
    
    if (holdings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Žádná data</td></tr>';
        return;
    }
    
    tbody.innerHTML = holdings.map(holding => {
        if (holding.total_value === null || holding.total_cost === null) {
            return `
                <tr>
                    <td><strong>${holding.stock_name}</strong></td>
                    <td>-</td>
                    <td>${formatCurrency(holding.total_cost)}</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            `;
        }
        
        const profitLoss = holding.profit_loss || 0;
        const profitLossPercent = holding.total_cost > 0 
            ? (profitLoss / holding.total_cost) * 100 
            : 0;
        const profitLossClass = profitLoss >= 0 ? 'profit' : 'loss';
        
        return `
            <tr>
                <td><strong>${holding.stock_name}</strong></td>
                <td>${formatCurrency(holding.total_value)}</td>
                <td>${formatCurrency(holding.total_cost)}</td>
                <td class="${profitLossClass}">${formatCurrency(profitLoss)}</td>
                <td class="${profitLossClass}">${formatPercentage(profitLossPercent)}</td>
            </tr>
        `;
    }).join('');
}

// Update profit/loss bar chart
function updateProfitLossChart(holdings) {
    const ctx = document.getElementById('profit-loss-chart');
    if (!ctx) return;
    
    // Filter holdings with valid data
    const validHoldings = holdings.filter(h => h.profit_loss !== null && h.profit_loss !== undefined);
    
    if (validHoldings.length === 0) {
        if (profitLossChart) {
            profitLossChart.destroy();
            profitLossChart = null;
        }
        ctx.parentElement.innerHTML = '<p class="loading">Žádná data pro zobrazení</p>';
        return;
    }
    
    // Calculate dynamic height based on number of stocks
    // Each bar needs approximately 50px, plus padding (100px top/bottom, 60px for labels)
    const minHeight = 300;
    const heightPerBar = 50;
    const padding = 160;
    
    // Adjust for mobile devices (smaller bars)
    const isMobile = window.innerWidth <= 768;
    const adjustedHeightPerBar = isMobile ? 40 : heightPerBar;
    const adjustedPadding = isMobile ? 120 : padding;
    
    const calculatedHeight = Math.max(minHeight, (validHoldings.length * adjustedHeightPerBar) + adjustedPadding);
    
    // Set the container height dynamically
    const chartContainer = ctx.closest('.chart-container');
    if (chartContainer) {
        chartContainer.style.height = `${calculatedHeight}px`;
    }
    
    // Sort by profit/loss (descending)
    const sortedHoldings = [...validHoldings].sort((a, b) => (b.profit_loss || 0) - (a.profit_loss || 0));
    
    const labels = sortedHoldings.map(h => h.stock_name);
    const profitLossData = sortedHoldings.map(h => h.profit_loss || 0);
    const colors = profitLossData.map(value => value >= 0 ? '#10b981' : '#ef4444');
    
    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Zisk/Ztráta (CZK)',
            data: profitLossData,
            backgroundColor: colors,
            borderColor: colors.map(c => c === '#10b981' ? '#059669' : '#dc2626'),
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
        }]
    };
    
    const config = {
        type: 'bar',
        data: chartData,
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.x;
                            const holding = sortedHoldings[context.dataIndex];
                            const percent = holding.total_cost > 0 
                                ? ((value / holding.total_cost) * 100).toFixed(2)
                                : '0.00';
                            return [
                                `Zisk/Ztráta: ${formatCurrency(value)}`,
                                `Procento: ${percent}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: ThemeManager.getChartGridColor()
                    },
                    ticks: {
                        color: ThemeManager.getChartTextColor(),
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: ThemeManager.getChartTextColor()
                    }
                }
            }
        }
    };
    
    if (profitLossChart) {
        profitLossChart.destroy();
    }
    
    profitLossChart = new Chart(ctx, config);
}

// Update portfolio distribution chart
function updatePortfolioDistributionChart(holdings) {
    const ctx = document.getElementById('portfolio-distribution-chart');
    if (!ctx) return;
    
    // Filter holdings with valid total value
    const validHoldings = holdings.filter(h => h.total_value !== null && h.total_value !== undefined && h.total_value > 0);
    
    if (validHoldings.length === 0) {
        if (portfolioDistributionChart) {
            portfolioDistributionChart.destroy();
            portfolioDistributionChart = null;
        }
        ctx.parentElement.innerHTML = '<p class="loading">Žádná data pro zobrazení</p>';
        return;
    }
    
    // Sort by total value (descending)
    const sortedHoldings = [...validHoldings].sort((a, b) => (b.total_value || 0) - (a.total_value || 0));
    
    const labels = sortedHoldings.map(h => h.stock_name);
    const values = sortedHoldings.map(h => h.total_value || 0);
    
    // Generate colors - use a nice color palette
    const colorPalette = [
        '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];
    const backgroundColors = values.map((_, i) => colorPalette[i % colorPalette.length]);
    
    const chartData = {
        labels: labels,
        datasets: [{
            data: values,
            backgroundColor: backgroundColors,
            borderColor: '#ffffff',
            borderWidth: 2,
        }]
    };
    
    const config = {
        type: 'doughnut',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        color: ThemeManager.getChartTextColor(),
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            const textColor = ThemeManager.getChartTextColor();
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return {
                                        text: `${label}: ${formatCurrency(value)} (${percentage}%)`,
                                        fontColor: textColor,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].borderColor,
                                        lineWidth: data.datasets[0].borderWidth,
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return [
                                `${label}: ${formatCurrency(value)}`,
                                `${percentage}% portfolia`
                            ];
                        }
                    }
                }
            }
        }
    };
    
    if (portfolioDistributionChart) {
        portfolioDistributionChart.destroy();
    }
    
    portfolioDistributionChart = new Chart(ctx, config);
}

// Toggle profit/loss view
window.toggleProfitLossView = function(view) {
    const chartContainer = document.getElementById('profit-loss-chart-container');
    const tableContainer = document.getElementById('profit-loss-table-container');
    const buttons = document.querySelectorAll('[onclick*="toggleProfitLossView"]');
    
    if (view === 'chart') {
        chartContainer.style.display = 'block';
        tableContainer.style.display = 'none';
        buttons.forEach(btn => {
            if (btn.getAttribute('data-view') === 'chart') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        // Recalculate chart height when switching to chart view
        // Small delay to ensure container is visible
        setTimeout(() => {
            if (profitLossChart && profitLossChart.data && profitLossChart.data.labels) {
                const numStocks = profitLossChart.data.labels.length;
                const minHeight = 300;
                const heightPerBar = window.innerWidth <= 768 ? 40 : 50;
                const padding = window.innerWidth <= 768 ? 120 : 160;
                const calculatedHeight = Math.max(minHeight, (numStocks * heightPerBar) + padding);
                const chartContainerDiv = document.querySelector('#profit-loss-chart .chart-container');
                if (chartContainerDiv) {
                    chartContainerDiv.style.height = `${calculatedHeight}px`;
                    profitLossChart.resize();
                }
            }
        }, 100);
    } else {
        chartContainer.style.display = 'none';
        tableContainer.style.display = 'block';
        buttons.forEach(btn => {
            if (btn.getAttribute('data-view') === 'table') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
};

// Toggle yearly profit/loss view
window.toggleYearlyProfitLossView = function(view) {
    const chartContainer = document.getElementById('yearly-profit-loss-chart-container');
    const tableContainer = document.getElementById('yearly-profit-loss-table-container');
    const buttons = document.querySelectorAll('[onclick*="toggleYearlyProfitLossView"]');
    
    if (view === 'chart') {
        chartContainer.style.display = 'block';
        tableContainer.style.display = 'none';
        buttons.forEach(btn => {
            if (btn.getAttribute('data-view') === 'chart') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    } else {
        chartContainer.style.display = 'none';
        tableContainer.style.display = 'block';
        buttons.forEach(btn => {
            if (btn.getAttribute('data-view') === 'table') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
};

// Load and display tax info
async function loadTaxInfo() {
    try {
        const yearSelect = document.getElementById('tax-year-select');
        const selectedYear =
            (yearSelect && yearSelect.value && !Number.isNaN(parseInt(yearSelect.value, 10)))
                ? parseInt(yearSelect.value, 10)
                : new Date().getFullYear();

        const response = await fetch(`/api/tax-info?year=${encodeURIComponent(selectedYear)}`);
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to load tax info';
            throw new Error(errorMsg);
        }

        // Populate year selector (years with any sales; always include current year)
        if (yearSelect && Array.isArray(data.available_years)) {
            const years = data.available_years;
            const existing = Array.from(yearSelect.options)
                .map(o => parseInt(o.value, 10))
                .filter(v => !Number.isNaN(v));

            const same =
                existing.length === years.length &&
                existing.every((v, i) => v === years[i]);

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
        
        const currentYearSalesElement = document.getElementById('current-year-sales');
        const currentYearSales = data.current_year_sales || 0;
        currentYearSalesElement.textContent = formatCurrency(currentYearSales);

        // Update selected year labels in UI
        const yearLabel1 = document.getElementById('tax-selected-year-label');
        const yearLabel2 = document.getElementById('tax-selected-year-label-2');
        if (yearLabel1) yearLabel1.textContent = data.selected_year || selectedYear;
        if (yearLabel2) yearLabel2.textContent = data.selected_year || selectedYear;
        
        // Change color to red if there are sales (non-zero), keep default (black) if 0
        if (currentYearSales > 0) {
            currentYearSalesElement.style.color = 'var(--danger-color)';
            currentYearSalesElement.style.fontWeight = '600';
        } else {
            currentYearSalesElement.style.color = '';
            currentYearSalesElement.style.fontWeight = '';
        }
        
        document.getElementById('current-year-sales-three-years').textContent = formatCurrency(data.current_year_sales_three_years || 0);
        document.getElementById('remaining-capacity').textContent = formatCurrency(data.remaining_tax_free_capacity);
        document.getElementById('three-year-value').textContent = formatCurrency(data.three_year_total_value);
    } catch (error) {
        handleError(error, 'Chyba při načítání daňových informací: ' + error.message);
    }
}

// Update stock name field based on transaction type
function updateStockNameField() {
    const type = document.getElementById('type').value;
    const textInput = document.getElementById('stock_name');
    const selectInput = document.getElementById('stock_name_select');
    
    if (type === 'sell') {
        textInput.style.display = 'none';
        textInput.removeAttribute('required');
        selectInput.style.display = 'block';
        selectInput.setAttribute('required', 'required');
        loadAvailableStocks();
    } else {
        textInput.style.display = 'block';
        textInput.setAttribute('required', 'required');
        selectInput.style.display = 'none';
        selectInput.removeAttribute('required');
    }
}

// Form validation
function validateTransactionForm() {
    const type = document.getElementById('type').value;
    const stockNameInput = type === 'sell' 
        ? document.getElementById('stock_name_select')
        : document.getElementById('stock_name');
    const priceInput = document.getElementById('price');
    const quantityInput = document.getElementById('quantity');
    const dateInput = document.getElementById('date');
    const feesInput = document.getElementById('fees');
    
    // Clear previous errors
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    
    let isValid = true;
    
    // Validate stock name
    if (!stockNameInput.value.trim()) {
        showFieldError(stockNameInput, 'Název akcie je povinný');
        isValid = false;
    }
    
    // Validate date
    if (!dateInput.value) {
        showFieldError(dateInput, 'Datum je povinné');
        isValid = false;
    }
    
    // Validate price
    const price = parseFloat(priceInput.value);
    if (!price || price <= 0) {
        showFieldError(priceInput, 'Cena musí být větší než 0');
        isValid = false;
    }
    
    // Validate quantity
    const quantity = parseInt(quantityInput.value);
    if (!quantity || quantity <= 0) {
        showFieldError(quantityInput, 'Množství musí být větší než 0');
        isValid = false;
    }

    // Sell-specific validation: prevent overselling current holdings
    if (type === 'sell') {
        const ok = validateSellQuantityAgainstHoldings(true);
        if (!ok) {
            isValid = false;
        }
    }
    
    // Validate fees
    const fees = parseFloat(feesInput.value) || 0;
    if (fees < 0) {
        showFieldError(feesInput, 'Poplatky nemohou být záporné');
        isValid = false;
    }
    
    return isValid;
}

function showFieldError(input, message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.style.color = 'var(--danger-color)';
    errorDiv.style.fontSize = '0.875rem';
    errorDiv.style.marginTop = '0.25rem';
    errorDiv.textContent = message;
    input.parentNode.appendChild(errorDiv);
    input.style.borderColor = 'var(--danger-color)';
}

function updateSellQuantityLimit(showErrors = false) {
    const type = document.getElementById('type')?.value;
    if (type !== 'sell') return;

    const selectInput = document.getElementById('stock_name_select');
    const quantityInput = document.getElementById('quantity');
    if (!selectInput || !quantityInput) return;

    const stockName = selectInput.value;
    const selectedOption = selectInput.options[selectInput.selectedIndex];
    const maxQty = stockName
        ? (availableSellQuantities[stockName] ??
            parseInt(selectedOption?.getAttribute('data-available-qty') || '0', 10))
        : null;

    if (maxQty !== null && !Number.isNaN(maxQty) && maxQty > 0) {
        quantityInput.setAttribute('max', String(maxQty));
    } else {
        quantityInput.removeAttribute('max');
    }

    if (showErrors) {
        validateSellQuantityAgainstHoldings(true);
    }
}

function validateSellQuantityAgainstHoldings(showFieldErrorMessage = false) {
    const type = document.getElementById('type')?.value;
    if (type !== 'sell') return true;

    const selectInput = document.getElementById('stock_name_select');
    const quantityInput = document.getElementById('quantity');
    if (!selectInput || !quantityInput) return true;

    const stockName = selectInput.value;
    if (!stockName) return true;

    const maxQty = availableSellQuantities[stockName] ?? 0;
    const qty = parseInt(quantityInput.value, 10) || 0;

    if (maxQty > 0 && qty > maxQty) {
        if (showFieldErrorMessage) {
            showFieldError(
                quantityInput,
                'Nelze prodat více kusů než je aktuálně drženo z důvodu zaručení správného výpočtu daňových informací.'
            );
        }
        return false;
    }

    return true;
}

// Load available stocks for sell dropdown
async function loadAvailableStocks() {
    try {
        const response = await fetch('/api/holdings');
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to load holdings';
            throw new Error(errorMsg);
        }
        
        const selectInput = document.getElementById('stock_name_select');
        const availableStocks = data.holdings.filter(h => h.quantity > 0);
        
        // Cache quantities for sell validation
        availableSellQuantities = {};
        availableStocks.forEach(h => {
            availableSellQuantities[h.stock_name] = h.quantity;
        });

        selectInput.innerHTML = '<option value="">Vyberte akcii...</option>' +
            availableStocks.map(h =>
                `<option value="${h.stock_name}" data-available-qty="${h.quantity}">${h.stock_name} (${formatNumber(h.quantity)} ks)</option>`
            ).join('');

        // Setup listeners (only once)
        const quantityInput = document.getElementById('quantity');
        if (!selectInput.dataset.qtyListeners) {
            selectInput.dataset.qtyListeners = '1';
            selectInput.addEventListener('change', () => updateSellQuantityLimit(true));
            if (quantityInput) {
                quantityInput.addEventListener('input', () => {
                    if (document.getElementById('type')?.value === 'sell') {
                        updateSellQuantityLimit(true);
                    }
                });
            }
        }

        updateSellQuantityLimit(false);
    } catch (error) {
        handleError(error, 'Chyba při načítání dostupných akcií');
    }
}

// Handle transaction form submission
const transactionForm = document.getElementById('transaction-form');
if (transactionForm) transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const type = document.getElementById('type').value;
    const stockNameInput = type === 'sell' 
        ? document.getElementById('stock_name_select')
        : document.getElementById('stock_name');
    
    const dateInput = document.getElementById('date');
    // Get ISO date format (YYYY-MM-DD) from data attribute or parse from DD.MM.YYYY
    let dateValue = dateInput.getAttribute('data-iso-date');
    if (!dateValue) {
        // Fallback: parse DD.MM.YYYY format
        const dateStr = dateInput.value;
        const parts = dateStr.split('.');
        if (parts.length === 3) {
            dateValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
            dateValue = dateInput.value; // Use as-is if format is different
        }
    }
    
    const feesInput = document.getElementById('fees');
    const fees = feesInput ? (parseFloat(feesInput.value) || 0) : 0;
    
    const formData = {
        type: type,
        stock_name: stockNameInput.value.trim(),
        date: dateValue,
        price: parseFloat(document.getElementById('price').value),
        quantity: parseInt(document.getElementById('quantity').value),
        fees: fees
    };
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoading(submitBtn.id || 'submit-btn', true);
    
    try {
        // Validate form
        if (!validateTransactionForm()) {
            return;
        }
        
        const token = await getCsrfToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['X-CSRFToken'] = token;
        }
        
        const response = await fetch('/api/transaction', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to add transaction';
            throw new Error(errorMsg);
        }
        
        showMessage('Transakce byla úspěšně přidána', 'success');
        
        // Reset form
        document.getElementById('transaction-form').reset();
        // Reset date picker
        const dateInput = document.getElementById('date');
        if (dateInput && dateInput._flatpickr) {
            dateInput._flatpickr.setDate(new Date(), false);
        }
        updateStockNameField();
        
        // Reload data
        await Promise.all([loadHoldings(), loadTaxInfo(), loadYearlyProfitLoss()]);
        
    } catch (error) {
        handleError(error, 'Chyba při přidávání transakce: ' + error.message);
    } finally {
        setLoading(submitBtn.id || 'submit-btn', false);
    }
});

// Handle update prices button
const updatePricesBtn = document.getElementById('update-prices-btn');
if (updatePricesBtn) updatePricesBtn.addEventListener('click', async () => {
    const btn = document.getElementById('update-prices-btn');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = 'Aktualizuji...';
    
    try {
        const token = await getCsrfToken();
        const headers = {};
        if (token) {
            headers['X-CSRFToken'] = token;
        }
        
        const response = await fetch('/api/update-prices', {
            method: 'POST',
            headers: headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            const errorMsg = data.error?.message || data.error || 'Failed to update prices';
            throw new Error(errorMsg);
        }
        
        showMessage(`Ceny aktualizovány: ${data.updated} úspěšně, ${data.failed} selhalo`, 'success');
        
        // Reload holdings to show updated prices
        await loadHoldings();
        await loadTaxInfo();
        
    } catch (error) {
        handleError(error, 'Chyba při aktualizaci cen: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Load yearly profit/loss
async function loadYearlyProfitLoss() {
    try {
        const response = await fetch('/api/yearly-profit-loss');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load yearly profit/loss');
        }
        
        displayYearlyProfitLoss(data.yearly_data);
        updateYearlyProfitLossChart(data.yearly_data);
    } catch (error) {
        handleError(error, 'Chyba při načítání ročních zisků/ztrát');
        document.getElementById('yearly-profit-loss-tbody').innerHTML = 
            '<tr><td colspan="5" class="loading">Chyba při načítání dat</td></tr>';
    }
}

// Display yearly profit/loss
function displayYearlyProfitLoss(yearlyData) {
    const tbody = document.getElementById('yearly-profit-loss-tbody');
    
    if (!yearlyData || yearlyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Žádné prodeje</td></tr>';
        return;
    }
    
    // Sort by year descending
    yearlyData.sort((a, b) => b.year - a.year);
    
    tbody.innerHTML = yearlyData.map(yearData => {
        const profitLoss = yearData.profit_loss || 0;
        const profitLossPercent = yearData.total_cost > 0 
            ? (profitLoss / yearData.total_cost) * 100 
            : 0;
        const profitLossClass = profitLoss >= 0 ? 'profit' : 'loss';
        
        return `
            <tr>
                <td><strong>${yearData.year}</strong></td>
                <td>${formatCurrency(yearData.total_sales)}</td>
                <td>${formatCurrency(yearData.total_cost)}</td>
                <td class="${profitLossClass}">${formatCurrency(profitLoss)}</td>
                <td class="${profitLossClass}">${formatPercentage(profitLossPercent)}</td>
            </tr>
        `;
    }).join('');
}

// Update yearly profit/loss chart
function updateYearlyProfitLossChart(yearlyData) {
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
    
    // Sort by year descending
    const sortedData = [...yearlyData].sort((a, b) => b.year - a.year);
    
    const labels = sortedData.map(d => d.year.toString());
    const profitLossData = sortedData.map(d => d.profit_loss || 0);
    const colors = profitLossData.map(value => value >= 0 ? '#10b981' : '#ef4444');
    
    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Zisk/Ztráta (CZK)',
            data: profitLossData,
            backgroundColor: colors,
            borderColor: colors.map(c => c === '#10b981' ? '#059669' : '#dc2626'),
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
        }]
    };
    
    const config = {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            const yearData = sortedData[context.dataIndex];
                            const percent = yearData.total_cost > 0 
                                ? ((value / yearData.total_cost) * 100).toFixed(2)
                                : '0.00';
                            return [
                                `Zisk/Ztráta: ${formatCurrency(value)}`,
                                `Prodeje: ${formatCurrency(yearData.total_sales)}`,
                                `Náklady: ${formatCurrency(yearData.total_cost)}`,
                                `Procento: ${percent}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: ThemeManager.getChartGridColor()
                    },
                    ticks: {
                        color: ThemeManager.getChartTextColor(),
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: ThemeManager.getChartTextColor()
                    }
                }
            }
        }
    };
    
    if (yearlyProfitLossChart) {
        yearlyProfitLossChart.destroy();
    }
    
    yearlyProfitLossChart = new Chart(ctx, config);
}

// Set today's date as default in date picker and configure calendar
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme toggle
    ThemeManager.init();

    const dateInput = document.getElementById('date');
    if (dateInput) {
        // Initialize Flatpickr with Czech locale and Monday as first day
        flatpickr(dateInput, {
            locale: 'cs',
            dateFormat: 'd.m.Y',
            altInput: false,
            altFormat: 'd.m.Y',
            firstDayOfWeek: 1, // Monday
            defaultDate: new Date(),
            allowInput: true,
            parseDate: (datestr, format) => {
                // Parse DD.MM.YYYY format
                const parts = datestr.split('.');
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                    const year = parseInt(parts[2], 10);
                    return new Date(year, month, day);
                }
                return null;
            },
            formatDate: (date, format) => {
                // Format as DD.MM.YYYY
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}.${month}.${year}`;
            },
            onChange: function(selectedDates, dateStr, instance) {
                // Convert to YYYY-MM-DD format for form submission
                if (selectedDates.length > 0) {
                    const date = selectedDates[0];
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    dateInput.setAttribute('data-iso-date', `${year}-${month}-${day}`);
                }
            }
        });
    }
    
    // Setup transaction type change handler
    const typeSelect = document.getElementById('type');
    if (typeSelect) {
        typeSelect.addEventListener('change', updateStockNameField);
        updateStockNameField(); // Initialize
    }
    
    // Load initial data
    loadHoldings();
    loadTaxInfo();
    loadYearlyProfitLoss();
    
    // Handle window resize to recalculate chart heights
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Recalculate profit/loss chart height if it exists
            if (profitLossChart && profitLossChart.data && profitLossChart.data.labels) {
                const numStocks = profitLossChart.data.labels.length;
                const minHeight = 300;
                const heightPerBar = window.innerWidth <= 768 ? 40 : 50;
                const padding = window.innerWidth <= 768 ? 120 : 160;
                const calculatedHeight = Math.max(minHeight, (numStocks * heightPerBar) + padding);
                const chartContainer = document.querySelector('#profit-loss-chart-container .chart-container');
                if (chartContainer) {
                    chartContainer.style.height = `${calculatedHeight}px`;
                    profitLossChart.resize();
                }
            }
        }, 250);
    });
});

