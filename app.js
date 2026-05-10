/**
 * app.js
 * Core application logic, DOM manipulation, and event handling.
 */

import { store } from './storage.js';
import { generateId, sanitize, formatCurrency, formatDate, getMonthYearString, CATEGORIES, trapFocus } from './utils.js';

// ---- DOM Elements ----
const els = {
  // Summary
  net: document.getElementById('summary-net'),
  income: document.getElementById('summary-income'),
  expense: document.getElementById('summary-expense'),
  
  // Budget
  budgetStatusText: document.getElementById('budget-status-text'),
  budgetProgress: document.getElementById('budget-progress'),
  budgetDetails: document.getElementById('budget-details'),
  budgetWarning: document.getElementById('budget-warning'),
  
  // Chart
  chartCanvas: document.getElementById('trend-chart'),
  
  // Transactions
  txnList: document.getElementById('transactions-list'),
  filterSearch: document.getElementById('filter-search'),
  filterType: document.getElementById('filter-type'),
  filterCategory: document.getElementById('filter-category'),
  filterMonth: document.getElementById('filter-month'),
  btnExport: document.getElementById('btn-export'),
  
  // Modals & Triggers
  btnAdd: document.getElementById('btn-add-floating'),
  
  txnModal: document.getElementById('transaction-modal'),
  btnCloseTxnModal: document.getElementById('btn-close-modal'),
  btnCancelTxnModal: document.getElementById('btn-cancel-modal'),
  txnForm: document.getElementById('transaction-form'),
  
  txnId: document.getElementById('txn-id'),
  txnTypeRadios: document.getElementsByName('txn-type'),
  txnAmount: document.getElementById('txn-amount'),
  txnCategory: document.getElementById('txn-category'),
  txnDate: document.getElementById('txn-date'),
  txnNote: document.getElementById('txn-note'),
  txnPayment: document.getElementById('txn-payment'),
  
  // Settings
  btnSettings: document.getElementById('btn-settings'),
  settingsModal: document.getElementById('settings-modal'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  settingsForm: document.getElementById('settings-form'),
  
  setCurrency: document.getElementById('setting-currency'),
  setBudget: document.getElementById('setting-budget'),
  setStartWeek: document.getElementById('setting-start-week'),
  
  // Data Tools
  btnImportTrigger: document.getElementById('btn-import-trigger'),
  fileImport: document.getElementById('file-import'),
  btnResetData: document.getElementById('btn-reset-data'),
  
  resetModal: document.getElementById('reset-modal'),
  btnCancelReset: document.getElementById('btn-cancel-reset'),
  btnConfirmReset: document.getElementById('btn-confirm-reset'),
  
  // Snackbar Undo
  snackbar: document.getElementById('snackbar'),
  snackbarMessage: document.getElementById('snackbar-message'),
  btnUndo: document.getElementById('btn-undo'),
};

// ---- State ----
let currentFilters = {
  search: '',
  type: 'all',
  category: 'all',
  month: getMonthYearString()
};

let undoTimeout = null;
let lastDeletedTxn = null;
let cleanupModalFocus = null;

// ---- Initialization ----
function init() {
  populateCategories('expense'); // default form state
  populateFilterCategories();
  
  // Set default values for forms
  els.filterMonth.value = currentFilters.month;
  
  // Update UI with stored settings
  const settings = store.getAll().settings;
  els.setCurrency.value = settings.currency;
  els.setBudget.value = settings.budget;
  els.setStartWeek.value = settings.startOfWeek;
  
  setupEventListeners();
  renderApp();
}

// ---- Render Pipelines ----
function renderApp() {
  renderDashboard();
  renderTransactions();
}

function renderDashboard() {
  const { transactions, settings } = store.getAll();
  const currency = settings.currency;
  
  // Filter for dashboard (only strictly current month)
  const currentMonthTxns = transactions.filter(t => t.date.startsWith(currentFilters.month));
  
  let totalIncome = 0;
  let totalExpense = 0;
  
  currentMonthTxns.forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    else if (t.type === 'expense') totalExpense += t.amount;
  });
  
  const net = totalIncome - totalExpense;
  
  els.net.textContent = formatCurrency(net, currency);
  els.income.textContent = formatCurrency(totalIncome, currency);
  els.expense.textContent = formatCurrency(totalExpense, currency);
  
  // Handle Net class coloring
  if (net < 0) {
    els.net.classList.remove('success');
    els.net.classList.add('danger');
  } else if (net > 0) {
    els.net.classList.remove('danger');
    els.net.classList.add('success');
  } else {
    els.net.classList.remove('danger', 'success');
  }

  renderBudget(totalExpense, settings.budget, currency);
  renderTrendChart(currentMonthTxns);
}

function renderBudget(spent, budgetTarget, currency) {
  if (budgetTarget <= 0) {
    els.budgetStatusText.textContent = "No budget set";
    els.budgetProgress.style.width = '0%';
    els.budgetDetails.textContent = `Spent ${formatCurrency(spent, currency)}`;
    els.budgetWarning.classList.add('hidden');
    return;
  }
  
  const pct = Math.min((spent / budgetTarget) * 100, 100);
  els.budgetStatusText.textContent = `${pct.toFixed(0)}%`;
  els.budgetProgress.style.width = `${pct}%`;
  
  // Reset classes
  els.budgetProgress.classList.remove('warning', 'danger');
  els.budgetWarning.classList.add('hidden');
  
  if (pct >= 100) {
    els.budgetProgress.classList.add('danger');
    els.budgetWarning.textContent = "Warning: You have exceeded your budget!";
    els.budgetWarning.classList.remove('hidden');
  } else if (pct >= 80) {
    els.budgetProgress.classList.add('warning');
    els.budgetWarning.textContent = "Warning: You are nearing your budget limit!";
    els.budgetWarning.classList.remove('hidden');
  }
  
  els.budgetDetails.textContent = `Spent ${formatCurrency(spent, currency)} of ${formatCurrency(budgetTarget, currency)}`;
}

function renderTrendChart(monthTxns) {
  const ctx = els.chartCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  
  // Adjust canvas size for high DPI displays
  const rect = els.chartCanvas.parentElement.getBoundingClientRect();
  els.chartCanvas.width = rect.width * dpr;
  els.chartCanvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  // clear
  ctx.clearRect(0, 0, rect.width, rect.height);
  
  if (monthTxns.length === 0) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No data for this month', rect.width / 2, rect.height / 2);
    return;
  }

  // Aggregate daily spends
  const daysInMonth = new Date(currentFilters.month.substring(0,4), currentFilters.month.substring(5,7), 0).getDate();
  let dailySpends = Array(daysInMonth).fill(0);
  
  monthTxns.forEach(t => {
    if (t.type === 'expense') {
      const day = parseInt(t.date.substring(8, 10), 10);
      dailySpends[day - 1] += t.amount;
    }
  });
  
  const maxSpend = Math.max(...dailySpends, 1); // Avoid div by 0
  const width = rect.width;
  const height = rect.height;
  
  // Draw simplified line chart
  const stepX = width / (daysInMonth - 1);
  ctx.beginPath();
  let started = false;
  
  for (let i = 0; i < daysInMonth; i++) {
    const x = i * stepX;
    // Leave some padding top/bottom (10%)
    const padding = height * 0.1;
    const y = (height - padding) - ((dailySpends[i] / maxSpend) * (height - padding * 2));
    
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  // Style line
  ctx.strokeStyle = '#ef4444'; // Danger color for expenses
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Draw gradient fill under line
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
  gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = gradient;
  ctx.fill();
}

function renderTransactions() {
  const { transactions, settings } = store.getAll();
  const currency = settings.currency;
  
  // Apply Filters
  let filtered = transactions.filter(t => {
    // Search
    const searchMatch = currentFilters.search === '' || 
      sanitize(t.note).toLowerCase().includes(currentFilters.search.toLowerCase()) ||
      sanitize(t.category).toLowerCase().includes(currentFilters.search.toLowerCase());
      
    // Type
    const typeMatch = currentFilters.type === 'all' || t.type === currentFilters.type;
    
    // Category
    const catMatch = currentFilters.category === 'all' || t.category === currentFilters.category;
    
    // Month
    const monthMatch = currentFilters.month === '' || t.date.startsWith(currentFilters.month);
    
    return searchMatch && typeMatch && catMatch && monthMatch;
  });
  
  // Sort Date Desc (default), but can be enhanced to sort by amount via added UI later
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  els.txnList.innerHTML = '';
  
  if (filtered.length === 0) {
    els.txnList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
        <p>No transactions found for these filters.</p>
      </div>
    `;
    return;
  }
  
  filtered.forEach(t => {
    const isNum = typeof t.amount === 'number';
    const numAmt = isNum ? t.amount : 0;
    
    // Icon
    const iconBase = t.type === 'income' ? 
      '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>' : 
      '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>';
      
    const el = document.createElement('div');
    el.className = 'txn-item';
    el.innerHTML = `
      <div class="txn-icon ${sanitize(t.type)}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${iconBase}
        </svg>
      </div>
      <div class="txn-details">
        <div class="txn-category">${sanitize(t.category)}</div>
        <div class="txn-note-date">${formatDate(t.date)}${t.note ? ' • ' + sanitize(t.note) : ''}</div>
      </div>
      <div class="txn-amounts">
        <div class="txn-amount ${sanitize(t.type)}">${t.type === 'income' ? '+' : '-'}${formatCurrency(numAmt, currency)}</div>
        <div class="txn-actions">
          <button class="icon-btn edit-txn" aria-label="Edit" data-id="${sanitize(t.id)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="icon-btn delete-txn" aria-label="Delete" data-id="${sanitize(t.id)}">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
    
    // Attach events using delegation or directly
    el.querySelector('.edit-txn').addEventListener('click', () => openTxnModal(t));
    el.querySelector('.delete-txn').addEventListener('click', () => handleTxnDelete(t.id));
    
    els.txnList.appendChild(el);
  });
}

// ---- Event Listeners ----
function setupEventListeners() {
  // Filters
  els.filterMonth.addEventListener('change', (e) => {
    currentFilters.month = e.target.value;
    renderApp();
  });
  
  els.filterType.addEventListener('change', (e) => {
    currentFilters.type = e.target.value;
    renderTransactions();
  });
  
  els.filterCategory.addEventListener('change', (e) => {
    currentFilters.category = e.target.value;
    renderTransactions();
  });
  
  els.filterSearch.addEventListener('input', (e) => {
    currentFilters.search = e.target.value;
    // Debounce usually needed, but for local data direct call is okay, but let's do small requestAnimationFrame to decouple
    requestAnimationFrame(renderTransactions);
  });
  
  // Modals & Forms
  els.btnAdd.addEventListener('click', () => openTxnModal());
  
  els.btnCloseTxnModal.addEventListener('click', closeTxnModal);
  els.btnCancelTxnModal.addEventListener('click', closeTxnModal);
  
  els.txnForm.addEventListener('submit', handleTxnSubmit);
  
  // Toggle Type in Form
  Array.from(els.txnTypeRadios).forEach(radio => {
    radio.addEventListener('change', (e) => {
      populateCategories(e.target.value);
    });
  });
  
  // Settings
  els.btnSettings.addEventListener('click', openSettingsModal);
  els.btnCloseSettings.addEventListener('click', closeSettingsModal);
  els.settingsForm.addEventListener('submit', handleSettingsSubmit);
  
  // Export/Import/Reset
  els.btnExport.addEventListener('click', handleExport);
  els.btnImportTrigger.addEventListener('click', () => els.fileImport.click());
  els.fileImport.addEventListener('change', handleImport);
  
  els.btnResetData.addEventListener('click', () => {
    closeSettingsModal();
    openResetModal();
  });
  els.btnCancelReset.addEventListener('click', closeResetModal);
  els.btnConfirmReset.addEventListener('click', confirmReset);
  
  // Undo Delete
  els.btnUndo.addEventListener('click', handleUndoDelete);
  
  // Window Resize for Chart redraw
  window.addEventListener('resize', () => {
    const { transactions } = store.getAll();
    const currentMonthTxns = transactions.filter(t => t.date.startsWith(currentFilters.month));
    requestAnimationFrame(() => renderTrendChart(currentMonthTxns));
  });
  
  // Close modals on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.txnModal.classList.contains('hidden')) closeTxnModal();
      if (!els.settingsModal.classList.contains('hidden')) closeSettingsModal();
      if (!els.resetModal.classList.contains('hidden')) closeResetModal();
    }
  });
}

// ---- Modals Logic ----
function openTxnModal(txn = null) {
  els.txnModal.classList.remove('hidden');
  cleanupModalFocus = trapFocus(els.txnModal);
  
  if (txn) {
    document.getElementById('modal-title').textContent = 'Edit Transaction';
    els.txnId.value = txn.id;
    els.txnAmount.value = txn.amount;
    els.txnDate.value = txn.date;
    els.txnNote.value = txn.note || '';
    els.txnPayment.value = txn.paymentMethod || '';
    
    // Set type
    Array.from(els.txnTypeRadios).forEach(r => {
      r.checked = r.value === txn.type;
    });
    populateCategories(txn.type, txn.category);
  } else {
    document.getElementById('modal-title').textContent = 'Add Transaction';
    els.txnForm.reset();
    els.txnId.value = '';
    // default to expense
    Array.from(els.txnTypeRadios).forEach(r => r.checked = r.value === 'expense');
    populateCategories('expense');
    els.txnDate.value = new Date().toISOString().substring(0, 10);
  }
  
  // Focus first input
  setTimeout(() => els.txnAmount.focus(), 100);
}

function closeTxnModal() {
  els.txnModal.classList.add('hidden');
  if (cleanupModalFocus) cleanupModalFocus();
  els.btnAdd.focus(); // restore focus
}

function handleTxnSubmit(e) {
  e.preventDefault();
  
  const selectedType = Array.from(els.txnTypeRadios).find(r => r.checked).value;
  const amountVal = parseFloat(els.txnAmount.value);
  
  if (isNaN(amountVal) || amountVal <= 0) {
    alert("Please enter a valid amount greater than 0");
    return;
  }
  
  const txnData = {
    type: selectedType,
    amount: amountVal,
    category: sanitize(els.txnCategory.value),
    date: sanitize(els.txnDate.value),
    note: sanitize(els.txnNote.value),
    paymentMethod: sanitize(els.txnPayment.value)
  };
  
  const idToEdit = els.txnId.value;
  
  if (idToEdit) {
    store.updateTransaction(idToEdit, txnData);
  } else {
    txnData.id = generateId();
    txnData.createdAt = new Date().toISOString();
    txnData.updatedAt = txnData.createdAt;
    store.addTransaction(txnData);
  }
  
  closeTxnModal();
  renderApp(); // Full rerender since counts change
}

// Delete & Undo
function handleTxnDelete(id) {
  // Capture the transaction before deleting
  const { transactions } = store.getAll();
  lastDeletedTxn = transactions.find(t => t.id === id);
  
  if(lastDeletedTxn) {
    store.deleteTransaction(id);
    renderApp();
    showUndoSnackbar();
  }
}

function showUndoSnackbar() {
  els.snackbar.classList.remove('hidden');
  els.snackbarMessage.textContent = `Deleted ${formatCurrency(lastDeletedTxn.amount, store.getAll().settings.currency)} ${lastDeletedTxn.category}`;
  
  if(undoTimeout) clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    els.snackbar.classList.add('hidden');
    lastDeletedTxn = null;
  }, 5000);
}

function handleUndoDelete() {
  if (lastDeletedTxn) {
    store.addTransaction(lastDeletedTxn);
    lastDeletedTxn = null;
    els.snackbar.classList.add('hidden');
    if(undoTimeout) clearTimeout(undoTimeout);
    renderApp();
  }
}

// Helpers for dropdowns
function populateCategories(type, selectedValue = '') {
  const options = CATEGORIES[type] || [];
  els.txnCategory.innerHTML = options.map(cat => `<option value="${sanitize(cat)}" ${cat === selectedValue ? 'selected' : ''}>${sanitize(cat)}</option>`).join('');
}

function populateFilterCategories() {
  // Extract all unique categories from current store just to be comprehensive, or just use the static list.
  const allCats = [...CATEGORIES.expense, ...CATEGORIES.income];
  const uniqueCats = [...new Set(allCats)].sort();
  
  const options = ['<option value="all">All Categories</option>'];
  uniqueCats.forEach(cat => {
    options.push(`<option value="${sanitize(cat)}">${sanitize(cat)}</option>`);
  });
  
  els.filterCategory.innerHTML = options.join('');
}

// ---- Settings Logic ----
function openSettingsModal() {
  els.settingsModal.classList.remove('hidden');
  cleanupModalFocus = trapFocus(els.settingsModal);
}

function closeSettingsModal() {
  els.settingsModal.classList.add('hidden');
  if (cleanupModalFocus) cleanupModalFocus();
  els.btnSettings.focus();
}

function handleSettingsSubmit(e) {
  e.preventDefault();
  store.updateSettings({
    currency: sanitize(els.setCurrency.value),
    budget: parseFloat(els.setBudget.value) || 0,
    startOfWeek: parseInt(els.setStartWeek.value, 10)
  });
  closeSettingsModal();
  renderApp();
}

// ---- Reset Logic ----
function openResetModal() {
  els.resetModal.classList.remove('hidden');
  trapFocus(els.resetModal);
}

function closeResetModal() {
  els.resetModal.classList.add('hidden');
}

function confirmReset() {
  import('./storage.js').then(module => {
    module.resetData();
    // Force reload to clean slate
    window.location.reload(); 
  });
}

// ---- Data Tools (Export/Import) ----
function handleExport() {
  const { transactions } = store.getAll();
  if (transactions.length === 0) {
    alert("No transactions to export.");
    return;
  }
  
  // Create CSV String
  const headers = ["type", "amount", "category", "date", "note", "paymentMethod"];
  let csvContent = headers.join(",") + "\n";
  
  transactions.forEach(t => {
    const row = headers.map(h => {
      let val = t[h] === undefined || t[h] === null ? "" : t[h];
      let strVal = String(val);
      if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\\")) {
        strVal = '"' + strVal.replace(/"/g, '""') + '"';
      }
      return strVal;
    });
    csvContent += row.join(",") + "\n";
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `expenses_export_${getMonthYearString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const jsonData = JSON.parse(event.target.result);
      
      let importedTxns = [];
      
      // Handle either the full backup format or array format
      if (Array.isArray(jsonData)) {
        importedTxns = jsonData;
      } else if (jsonData && typeof jsonData === 'object' && Array.isArray(jsonData.transactions)) {
        importedTxns = jsonData.transactions;
        // Optionally import settings if they exist
        if (jsonData.settings) {
            store.updateSettings(jsonData.settings);
        }
      } else {
        throw new Error("Invalid structure. Must contain a 'transactions' array or be a JSON array of transactions.");
      }
      
      // Basic validation of standard required fields
      const errors = [];
      let validCount = 0;
      
      importedTxns.forEach((t, index) => {
        if (!t.type || !['expense', 'income'].includes(t.type)) {
           errors.push(`Row ${index+1}: Invalid or missing 'type'.`);
           return;
        }
        if (typeof t.amount !== 'number' || t.amount <= 0) {
           errors.push(`Row ${index+1}: 'amount' must be a positive number.`);
           return;
        }
        if (!t.category) {
           errors.push(`Row ${index+1}: Missing 'category'.`);
           return;
        }
        
        let txnData = { ...t };
        if (!txnData.id) txnData.id = generateId();
        if (!txnData.date) txnData.date = new Date().toISOString().substring(0, 10);
        if (!txnData.createdAt) txnData.createdAt = new Date().toISOString();
        if (!txnData.updatedAt) txnData.updatedAt = txnData.createdAt;
        
        // Add to store
        // Since we are adding one by one, we will replace if id matches, otherwise append.
        store.updateTransaction(txnData.id, txnData);
        // If it didn't exist in store, add it
        const exists = store.getAll().transactions.some(existing => existing.id === txnData.id);
        if (!exists) {
           store.addTransaction(txnData);
        }
        validCount++;
      });
      
      if (errors.length > 0) {
        alert(`Imported ${validCount} transactions, but encountered errors:\n\n${errors.slice(0, 5).join('\\n')}${errors.length > 5 ? '\\n...and more.' : ''}`);
      } else {
        alert(`Successfully imported ${validCount} transactions.`);
      }
      
      closeSettingsModal();
      renderApp();
      
    } catch (err) {
      alert(`Import failed: ${err.message}. Please provide a valid JSON.`);
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // Reset input
}

// Boot the app
document.addEventListener('DOMContentLoaded', init);
