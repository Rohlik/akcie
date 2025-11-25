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

// Display holdings in table
function displayHoldings(holdings) {
    const tbody = document.getElementById('holdings-tbody');
    
    if (holdings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Žádné akcie v portfoliu</td></tr>';
        return;
    }
    
    tbody.innerHTML = holdings.map(holding => {
        const isThreeYear = holding.three_year_quantity > 0;
        const rowClass = isThreeYear ? 'three-year-holding' : '';
        const profitLossClass = holding.profit_loss !== null 
            ? (holding.profit_loss >= 0 ? 'profit' : 'loss') 
            : '';
        
        return `
            <tr class="${rowClass}">
                <td><strong>${holding.stock_name}</strong></td>
                <td>${formatNumber(holding.quantity)}</td>
                <td class="highlight-green">${formatNumber(holding.three_year_quantity)}</td>
                <td>${formatCurrency(holding.average_purchase_price)}</td>
                <td>${holding.current_price !== null ? formatCurrency(holding.current_price) : '<span style="color: #999;">Nedostupné</span>'}</td>
                <td>${holding.total_value !== null ? formatCurrency(holding.total_value) : '-'}</td>
                <td class="${profitLossClass}">
                    ${holding.profit_loss !== null ? formatCurrency(holding.profit_loss) : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

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

// Handle transaction form submission
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        type: document.getElementById('type').value,
        stock_name: document.getElementById('stock_name').value.trim(),
        date: document.getElementById('date').value,
        price: parseFloat(document.getElementById('price').value),
        quantity: parseInt(document.getElementById('quantity').value)
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
        
        // Reload data
        await Promise.all([loadHoldings(), loadTaxInfo()]);
        
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

// Set today's date as default in date picker
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }
    
    // Load initial data
    loadHoldings();
    loadTaxInfo();
});

