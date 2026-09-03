// "Přidat transakci" form: validation, sell-quantity cap, and submission.

import { formatNumber, parseCsDateToIso, csDatePickerOptions, escapeHtml } from './format.js';
import { csrfFetch, readJson, extractErrorMessage } from './api.js';
import { showMessage, showFieldError, clearFieldErrors, handleError, setLoading } from './ui.js';
import { loadHoldings, getAvailableSellQuantities } from './holdings.js';
import { loadTaxInfo } from './tax.js';
import { reloadDataAfterMutation } from './transactions.js';

function currentType() {
    return document.getElementById('type')?.value;
}

function stockNameInput() {
    return currentType() === 'sell'
        ? document.getElementById('stock_name_select')
        : document.getElementById('stock_name');
}

function updateStockNameField() {
    const type = currentType();
    const textInput = document.getElementById('stock_name');
    const selectInput = document.getElementById('stock_name_select');
    const textLabel = document.getElementById('stock_name_label');
    const selectLabel = document.getElementById('stock_name_select_label');
    if (!textInput || !selectInput) return;

    // Each control keeps its own <label for>, so whichever one is showing is
    // the one that is labelled.
    const selling = type === 'sell';
    textInput.hidden = selling;
    textInput.toggleAttribute('required', !selling);
    selectInput.hidden = !selling;
    selectInput.toggleAttribute('required', selling);
    if (textLabel) textLabel.hidden = selling;
    if (selectLabel) selectLabel.hidden = !selling;

    if (selling) loadAvailableStocks();
}

async function loadAvailableStocks() {
    try {
        const response = await fetch('/api/holdings');
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to load holdings'));
        }

        const selectInput = document.getElementById('stock_name_select');
        const availableStocks = data.holdings.filter(h => h.quantity > 0);

        selectInput.innerHTML = '<option value="">Vyberte akcii...</option>' +
            availableStocks.map(h => {
                const safe = escapeHtml(h.stock_name);
                return `<option value="${safe}" data-available-qty="${h.quantity}">${safe} (${formatNumber(h.quantity)} ks)</option>`;
            }).join('');

        const quantityInput = document.getElementById('quantity');
        if (!selectInput.dataset.qtyListeners) {
            selectInput.dataset.qtyListeners = '1';
            selectInput.addEventListener('change', () => updateSellQuantityLimit(true));
            if (quantityInput) {
                quantityInput.addEventListener('input', () => {
                    if (currentType() === 'sell') updateSellQuantityLimit(true);
                });
            }
        }

        updateSellQuantityLimit(false);
    } catch (error) {
        handleError(error, 'Chyba při načítání dostupných akcií');
    }
}

function updateSellQuantityLimit(showErrors) {
    if (currentType() !== 'sell') return;
    const selectInput = document.getElementById('stock_name_select');
    const quantityInput = document.getElementById('quantity');
    if (!selectInput || !quantityInput) return;

    const stockName = selectInput.value;
    const selectedOption = selectInput.options[selectInput.selectedIndex];
    const available = getAvailableSellQuantities();
    const maxQty = stockName
        ? (available[stockName] ?? parseInt(selectedOption?.getAttribute('data-available-qty') || '0', 10))
        : null;

    if (maxQty !== null && !Number.isNaN(maxQty) && maxQty > 0) {
        quantityInput.setAttribute('max', String(maxQty));
    } else {
        quantityInput.removeAttribute('max');
    }

    if (showErrors) validateSellQuantityAgainstHoldings(true);
}

function validateSellQuantityAgainstHoldings(showFieldErrors) {
    if (currentType() !== 'sell') return true;
    const selectInput = document.getElementById('stock_name_select');
    const quantityInput = document.getElementById('quantity');
    if (!selectInput || !quantityInput) return true;

    const stockName = selectInput.value;
    if (!stockName) return true;

    const available = getAvailableSellQuantities();
    const maxQty = available[stockName] ?? 0;
    const qty = parseInt(quantityInput.value, 10) || 0;

    if (maxQty > 0 && qty > maxQty) {
        if (showFieldErrors) {
            showFieldError(
                quantityInput,
                'Nelze prodat více kusů než je aktuálně drženo z důvodu zaručení správného výpočtu daňových informací.'
            );
        }
        return false;
    }
    return true;
}

function validateForm() {
    const type = currentType();
    const nameInput = stockNameInput();
    const priceInput = document.getElementById('price');
    const quantityInput = document.getElementById('quantity');
    const dateInput = document.getElementById('date');
    const feesInput = document.getElementById('fees');

    clearFieldErrors();
    let valid = true;

    if (!nameInput.value.trim()) {
        showFieldError(nameInput, 'Název akcie je povinný');
        valid = false;
    }

    const isoDate = parseCsDateToIso(dateInput.value);
    if (!isoDate) {
        showFieldError(dateInput, 'Zadejte platné datum ve formátu DD.MM.YYYY');
        valid = false;
    }

    const price = parseFloat(priceInput.value);
    if (!price || price <= 0) {
        showFieldError(priceInput, 'Cena musí být větší než 0');
        valid = false;
    }

    const quantity = parseInt(quantityInput.value, 10);
    if (!quantity || quantity <= 0) {
        showFieldError(quantityInput, 'Množství musí být větší než 0');
        valid = false;
    }

    if (type === 'sell' && !validateSellQuantityAgainstHoldings(true)) valid = false;

    const fees = parseFloat(feesInput.value) || 0;
    if (fees < 0) {
        showFieldError(feesInput, 'Poplatky nemohou být záporné');
        valid = false;
    }

    return { valid, isoDate };
}

function initDatePicker() {
    const dateInput = document.getElementById('date');
    if (!dateInput) return;
    flatpickr(dateInput, csDatePickerOptions(new Date()));
}

export function initTransactionForm() {
    const form = document.getElementById('transaction-form');
    if (!form) return;

    initDatePicker();

    const typeSelect = document.getElementById('type');
    if (typeSelect) {
        typeSelect.addEventListener('change', updateStockNameField);
        updateStockNameField();
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        setLoading(submitBtn?.id || 'submit-btn', true);

        try {
            const { valid, isoDate } = validateForm();
            if (!valid) return;

            const payload = {
                type: currentType(),
                stock_name: stockNameInput().value.trim(),
                date: isoDate,
                price: parseFloat(document.getElementById('price').value),
                quantity: parseInt(document.getElementById('quantity').value, 10),
                fees: parseFloat(document.getElementById('fees').value) || 0,
            };

            const response = await csrfFetch('/api/transaction', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const data = await readJson(response);
            if (!response.ok) {
                throw new Error(extractErrorMessage(data, 'Failed to add transaction'));
            }

            showMessage('Transakce byla úspěšně přidána', 'success');

            form.reset();
            const dateInput = document.getElementById('date');
            if (dateInput && dateInput._flatpickr) {
                dateInput._flatpickr.setDate(new Date(), false);
            }

            // Reload first so holdings are fresh before the sell-select
            // repopulates; otherwise updateStockNameField would also fire its
            // own /api/holdings fetch.
            await reloadDataAfterMutation();
            updateStockNameField();
        } catch (error) {
            handleError(error, 'Chyba při přidávání transakce: ' + error.message);
        } finally {
            setLoading(submitBtn?.id || 'submit-btn', false);
        }
    });
}

export function initUpdatePricesButton() {
    const btn = document.getElementById('update-prices-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Aktualizuji...';

        try {
            const response = await csrfFetch('/api/update-prices', { method: 'POST' });
            const data = await readJson(response);
            if (!response.ok) {
                throw new Error(extractErrorMessage(data, 'Failed to update prices'));
            }
            showMessage(`Ceny aktualizovány: ${data.updated} úspěšně, ${data.failed} selhalo`, 'success');
            // Only holdings and tax info depend on current prices; no
            // transactions changed, so Obchody and yearly P/L can stay as-is.
            await Promise.all([loadHoldings(), loadTaxInfo()]);
        } catch (error) {
            handleError(error, 'Chyba při aktualizaci cen: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}
