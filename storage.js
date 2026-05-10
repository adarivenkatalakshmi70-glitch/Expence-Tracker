/**
 * storage.js
 * Handles data persistence to localStorage and schema migrations.
 */

const STORAGE_KEY = 'expenseTracker:data';
const CURRENT_VERSION = 1;

const DEFAULT_DATA = {
  version: CURRENT_VERSION,
  settings: {
    currency: '₹',
    budget: 0,
    startOfWeek: 1 // 1 for Monday, 0 for Sunday
  },
  transactions: []
};

/**
 * Migrates old data shapes to the current version.
 */
function migrate(data) {
  if (!data || typeof data !== 'object') return structuredClone(DEFAULT_DATA);
  
  let migrated = structuredClone(data);
  
  // Example of future migration:
  // if (migrated.version === 1) {
  //   migrated.version = 2; // structure changes here
  // }
  
  // Defensive checks to ensure all keys exist
  if (!migrated.settings) {
    migrated.settings = { ...DEFAULT_DATA.settings };
  } else {
    // Fill missing settings keys if any
    migrated.settings = { ...DEFAULT_DATA.settings, ...migrated.settings };
  }

  if (!Array.isArray(migrated.transactions)) {
    migrated.transactions = [];
  }
  
  migrated.version = CURRENT_VERSION;
  return migrated;
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.error("Local storage corrupted. Returning default data.", e);
    // In a real app we might prompt the user, but returning default prevents white screen of death
    return structuredClone(DEFAULT_DATA);
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("Failed to save data to localStorage.", e);
    alert("Warning: Could not save data. Your browser might be blocking local storage.");
    return false;
  }
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  return structuredClone(DEFAULT_DATA);
}

// Global state instance to act as a simple reactive store
export const store = {
  state: loadData(),
  
  updateSettings(settingsPatch) {
    this.state.settings = { ...this.state.settings, ...settingsPatch };
    saveData(this.state);
  },
  
  addTransaction(txn) {
    this.state.transactions.push(txn);
    saveData(this.state);
  },
  
  updateTransaction(id, updates) {
    const idx = this.state.transactions.findIndex(t => t.id === id);
    if(idx > -1) {
      this.state.transactions[idx] = { 
        ...this.state.transactions[idx], 
        ...updates, 
        updatedAt: new Date().toISOString() 
      };
      saveData(this.state);
    }
  },
  
  deleteTransaction(id) {
    this.state.transactions = this.state.transactions.filter(t => t.id !== id);
    saveData(this.state);
  },

  getAll() {
    return this.state;
  },

  replaceData(newData) {
    this.state = migrate(newData);
    saveData(this.state);
  }
};
