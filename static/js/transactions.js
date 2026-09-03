// Transaction CRUD + per-stock history expansion + Obchody (20 most recent).
//
// DOM events use delegation via data-action attributes on rendered rows, so
// no inline onclick is required anywhere.

import {
    formatCurrency, formatIsoDateCs, parseCsDateToIso,
    transactionTotalValue, renderTransactionRow, csDatePickerOptions,
} from './format.js';
import { csrfFetch, readJson, extractErrorMessage } from './api.js';
import { showMessage, handleError } from './ui.js';
import { loadHoldings } from './holdings.js';
import { loadTaxInfo, loadYearlyProfitLoss } from './tax.js';

function reloadDataAfterMutation() {
    return Promise.all([
        loadHoldings(),
        loadTaxInfo(),
        loadYearlyProfitLoss(),
        loadRecentTransactions(),
    ]);
}

// --- Stock history (inside Portfolio expandable rows) ------------------------

async function loadStockHistory(stockName, contentEl) {
    if (!contentEl) return;
    contentEl.classList.add('loading');
    try {
        const response = await fetch(`/api/transactions?stock=${encodeURIComponent(stockName)}`);
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to load history'));
        }

        const transactions = data.transactions || [];
        if (transactions.length === 0) {
            contentEl.classList.remove('loading');
            contentEl.innerHTML = '<p>Žádné transakce pro tuto akcii.</p>';
            return;
        }

        contentEl.classList.remove('loading');
        contentEl.innerHTML = `
            <table class="history-table">
                <thead>
                    <tr>
                        <th scope="col">Datum</th>
                        <th scope="col">Typ</th>
                        <th scope="col" class="num">Cena (CZK)</th>
                        <th scope="col" class="num">Množství</th>
                        <th scope="col" class="num">Poplatky (CZK)</th>
                        <th scope="col" class="num">Celková hodnota</th>
                        <th scope="col" class="col-actions">Akce</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map(tx => renderTransactionRow(tx, { showStock: false, showActions: true })).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Error loading stock history:', error);
        contentEl.classList.remove('loading');
        contentEl.innerHTML = '<p class="error-text">Historii se nepodařilo načíst. Zkuste to znovu.</p>';
    }
}

// --- Ticker rename -----------------------------------------------------------

async function postRename(oldName, newName, confirmMerge) {
    const response = await csrfFetch('/api/stock/rename', {
        method: 'POST',
        body: JSON.stringify({ old_name: oldName, new_name: newName, confirm_merge: confirmMerge }),
    });
    return { response, data: await readJson(response) };
}

async function renameStock(oldName) {
    const input = prompt(`Přejmenovat ticker "${oldName}" na:`, oldName);
    if (input === null) return;

    const newName = input.trim();
    if (!newName || newName === oldName) return;

    try {
        let { response, data } = await postRename(oldName, newName, false);

        // The server rejects a merge it was not told to expect: fusing two lot
        // streams cannot be undone by renaming back.
        if (response.status === 409 && data?.error?.code === 'MERGE_REQUIRES_CONFIRMATION') {
            const proceed = confirm(
                `${extractErrorMessage(data, '')}\n\n` +
                'Sloučení je nevratné - zpětné přejmenování pozice znovu nerozdělí. Pokračovat?'
            );
            if (!proceed) return;
            ({ response, data } = await postRename(oldName, newName, true));
        }

        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to rename ticker'));
        }

        showMessage(
            data.merged
                ? `${oldName} sloučeno do ${data.new_name} (${data.renamed} transakcí). Aktualizujte ceny.`
                : `${oldName} přejmenováno na ${data.new_name} (${data.renamed} transakcí). Aktualizujte ceny.`,
            'success'
        );
        await reloadDataAfterMutation();
    } catch (error) {
        handleError(error, 'Chyba při přejmenování tickeru: ' + error.message);
    }
}

function toggleHistory(historyId, stockName) {
    const historyRow = document.getElementById(historyId);
    if (!historyRow) return;
    const visible = historyRow.style.display !== 'none';
    const toggle = document.querySelector(`[data-action="toggle-history"][aria-controls="${historyId}"]`);
    const icon = toggle?.querySelector('.expand-icon');

    if (visible) {
        historyRow.style.display = 'none';
        if (icon) icon.textContent = '▼';
        toggle?.setAttribute('aria-expanded', 'false');
        return;
    }

    historyRow.style.display = 'table-row';
    if (icon) icon.textContent = '▲';
    toggle?.setAttribute('aria-expanded', 'true');

    const contentEl = historyRow.querySelector('.history-content > div');
    if (contentEl && contentEl.textContent.trim() === 'Načítání...') {
        loadStockHistory(stockName, contentEl);
    }
}

// --- Edit / save / delete ----------------------------------------------------

function convertRowToEditMode(row, transaction) {
    row.classList.add('edit-mode');
    row.dataset.originalDate = transaction.date;
    row.dataset.originalPrice = transaction.price;
    row.dataset.originalQuantity = transaction.quantity;
    row.dataset.originalFees = transaction.fees || 0;

    const displayDate = formatIsoDateCs(transaction.date);

    const typeClass = transaction.type === 'buy' ? 'tx-type' : 'tx-type tx-type-sell';
    row.innerHTML = `
        <td>
            <input type="text" class="edit-date" value="${displayDate}" placeholder="DD.MM.YYYY"
                   aria-label="Datum">
        </td>
        <td><span class="${typeClass}">${transaction.type === 'buy' ? 'Nákup' : 'Prodej'}</span></td>
        <td>
            <input type="number" class="edit-price" value="${transaction.price}" step="0.01" min="0"
                   aria-label="Cena v CZK">
        </td>
        <td>
            <input type="number" class="edit-quantity" value="${transaction.quantity}" min="1"
                   aria-label="Množství">
        </td>
        <td>
            <input type="number" class="edit-fees" value="${transaction.fees || 0}" step="0.01" min="0"
                   aria-label="Poplatky v CZK">
        </td>
        <td class="tx-total">-</td>
        <td>
            <button type="button" class="btn-save" data-action="save-tx" title="Uložit" aria-label="Uložit">✓</button>
            <button type="button" class="btn-cancel" data-action="cancel-tx" title="Zrušit" aria-label="Zrušit">✕</button>
        </td>
    `;

    const dateInput = row.querySelector('.edit-date');
    if (dateInput) flatpickr(dateInput, csDatePickerOptions(transaction.date));

    const updateTotal = () => {
        const price = parseFloat(row.querySelector('.edit-price').value) || 0;
        const quantity = parseInt(row.querySelector('.edit-quantity').value, 10) || 0;
        const fees = parseFloat(row.querySelector('.edit-fees').value) || 0;
        const total = transactionTotalValue({ type: transaction.type, price, quantity, fees });
        row.querySelector('.tx-total').textContent = formatCurrency(total);
    };

    row.querySelector('.edit-price').addEventListener('input', updateTotal);
    row.querySelector('.edit-quantity').addEventListener('input', updateTotal);
    row.querySelector('.edit-fees').addEventListener('input', updateTotal);
    updateTotal();
}

async function startEdit(row) {
    const txId = parseInt(row.dataset.txId, 10);
    const stockName = row.dataset.txStock;
    if (row.classList.contains('edit-mode')) return;

    try {
        const response = await fetch(`/api/transactions?stock=${encodeURIComponent(stockName)}`);
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to load transaction'));
        }
        const transaction = (data.transactions || []).find(tx => tx.id === txId);
        if (!transaction) {
            showMessage('Transakce nenalezena', 'error');
            return;
        }
        convertRowToEditMode(row, transaction);
    } catch (error) {
        handleError(error, 'Chyba při úpravě transakce: ' + error.message);
    }
}

async function saveEdit(row) {
    const txId = parseInt(row.dataset.txId, 10);
    try {
        const dateInput = row.querySelector('.edit-date');
        const iso = parseCsDateToIso(dateInput.value);
        if (!iso) {
            showMessage('Neplatný formát data. Použijte DD.MM.YYYY.', 'error');
            return;
        }

        const price = parseFloat(row.querySelector('.edit-price').value);
        const quantity = parseInt(row.querySelector('.edit-quantity').value, 10);
        const fees = parseFloat(row.querySelector('.edit-fees').value) || 0;

        if (!price || price <= 0 || !quantity || quantity <= 0 || fees < 0) {
            showMessage('Neplatné hodnoty', 'error');
            return;
        }

        const response = await csrfFetch(`/api/transaction/${txId}`, {
            method: 'PUT',
            body: JSON.stringify({ date: iso, price, quantity, fees }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to update transaction'));
        }

        showMessage('Transakce byla úspěšně aktualizována', 'success');
        await reloadDataAfterMutation();
    } catch (error) {
        handleError(error, 'Chyba při ukládání transakce: ' + error.message);
    }
}

async function deleteRow(row) {
    if (!confirm('Opravdu chcete smazat tuto transakci? Tato akce je nevratná.')) return;
    const txId = parseInt(row.dataset.txId, 10);
    try {
        const response = await csrfFetch(`/api/transaction/${txId}`, { method: 'DELETE' });
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to delete transaction'));
        }
        showMessage('Transakce byla úspěšně smazána', 'success');
        await reloadDataAfterMutation();
    } catch (error) {
        handleError(error, 'Chyba při mazání transakce: ' + error.message);
    }
}

async function cancelEdit(row) {
    await reloadVisibleHistoryFor(row.dataset.txStock);
}

async function reloadVisibleHistoryFor(stockName) {
    // Used by cancelEdit: if the per-stock history is currently expanded,
    // re-render it so the canceled row returns to its non-edit state.
    const matchingRow = document.querySelector(
        `.holding-row[data-stock="${stockName}"] + .history-row[style*="table-row"] .history-content > div`
    );
    if (matchingRow) await loadStockHistory(stockName, matchingRow);
}

// --- Recent transactions (Obchody) -------------------------------------------

export async function loadRecentTransactions() {
    const tbody = document.getElementById('recent-transactions-tbody');
    if (!tbody) return;
    try {
        const response = await fetch('/api/transactions?limit=20');
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Failed to load transactions'));
        }

        const transactions = data.transactions || [];
        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">Žádné transakce</td></tr>';
            return;
        }

        tbody.innerHTML = transactions
            .map(tx => renderTransactionRow(tx, { showStock: true, showActions: false }))
            .join('');
    } catch (error) {
        console.error('Error loading recent transactions:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Chyba při načítání transakcí</td></tr>';
    }
}

// --- Event delegation --------------------------------------------------------

export function initTransactionInteractions() {
    document.addEventListener('click', async event => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;

        const action = actionEl.dataset.action;
        if (action === 'toggle-history') {
            toggleHistory(actionEl.dataset.historyId, actionEl.dataset.stock);
            return;
        }
        if (action === 'rename-stock') {
            await renameStock(actionEl.dataset.stock);
            return;
        }

        const row = actionEl.closest('tr[data-tx-id]');
        if (!row) return;

        switch (action) {
            case 'edit-tx': await startEdit(row); break;
            case 'save-tx': await saveEdit(row); break;
            case 'cancel-tx': await cancelEdit(row); break;
            case 'delete-tx': await deleteRow(row); break;
            default: break;
        }
    });
}

export { reloadDataAfterMutation };
