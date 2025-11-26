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

// Load and display holdings
async function loadHoldings() {
    try {
        const response = await fetch('/api/holdings');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load holdings');
        }
        
        displayHoldings(data.holdings);
        displayProfitLoss(data.holdings);
    } catch (error) {
        console.error('Error loading holdings:', error);
        showMessage('Chyba při načítání portfolia: ' + error.message, 'error');
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
                        <h4>Historie transakcí pro ${holding.stock_name}</h4>
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
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map(tx => {
                        const typeClass = tx.type === 'buy' ? 'profit' : 'loss';
                        const typeText = tx.type === 'buy' ? 'Nákup' : 'Prodej';
                        const fees = tx.fees || 0;
                        const totalValue = tx.type === 'buy' 
                            ? (tx.price * tx.quantity) + fees  // Buy: price + fees
                            : (tx.price * tx.quantity) - fees; // Sell: price - fees
                        return `
                            <tr>
                                <td>${tx.date}</td>
                                <td><span class="${typeClass}">${typeText}</span></td>
                                <td>${formatCurrency(tx.price)}</td>
                                <td>${formatNumber(tx.quantity)}</td>
                                <td>${fees > 0 ? formatCurrency(fees) : '-'}</td>
                                <td>${formatCurrency(totalValue)}</td>
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

// Load and display tax info
async function loadTaxInfo() {
    try {
        const response = await fetch('/api/tax-info');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load tax info');
        }
        
        document.getElementById('current-year-sales').textContent = formatCurrency(data.current_year_sales);
        document.getElementById('remaining-capacity').textContent = formatCurrency(data.remaining_tax_free_capacity);
        document.getElementById('three-year-value').textContent = formatCurrency(data.three_year_total_value);
    } catch (error) {
        console.error('Error loading tax info:', error);
        showMessage('Chyba při načítání daňových informací: ' + error.message, 'error');
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

// Load available stocks for sell dropdown
async function loadAvailableStocks() {
    try {
        const response = await fetch('/api/holdings');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load holdings');
        }
        
        const selectInput = document.getElementById('stock_name_select');
        const availableStocks = data.holdings.filter(h => h.quantity > 0);
        
        selectInput.innerHTML = '<option value="">Vyberte akcii...</option>' +
            availableStocks.map(h => 
                `<option value="${h.stock_name}">${h.stock_name} (${formatNumber(h.quantity)} ks)</option>`
            ).join('');
    } catch (error) {
        console.error('Error loading available stocks:', error);
    }
}

// Handle transaction form submission
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
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
    
    try {
        const response = await fetch('/api/transaction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to add transaction');
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
        console.error('Error adding transaction:', error);
        showMessage('Chyba při přidávání transakce: ' + error.message, 'error');
    }
});

// Handle update prices button
document.getElementById('update-prices-btn').addEventListener('click', async () => {
    const btn = document.getElementById('update-prices-btn');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = 'Aktualizuji...';
    
    try {
        const response = await fetch('/api/update-prices', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to update prices');
        }
        
        showMessage(`Ceny aktualizovány: ${data.updated} úspěšně, ${data.failed} selhalo`, 'success');
        
        // Reload holdings to show updated prices
        await loadHoldings();
        await loadTaxInfo();
        
    } catch (error) {
        console.error('Error updating prices:', error);
        showMessage('Chyba při aktualizaci cen: ' + error.message, 'error');
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
    } catch (error) {
        console.error('Error loading yearly profit/loss:', error);
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

// Set today's date as default in date picker and configure calendar
document.addEventListener('DOMContentLoaded', () => {
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
});

