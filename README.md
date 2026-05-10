Plan:
1) Scaffold the project structure and HTML layout.
2) Implement storage layer + migrations + settings.
3) Implement transactions CRUD + validation + undo delete.
4) Implement dashboard summaries.
5) Implement filters/search/sort.
6) Implement budget.
7) Implement export/import/reset.
8) Accessibility pass: focus traps in modals, keyboard shortcuts (Esc closes modal), aria-labels.
9) Final polish: empty states, responsive tweaks, reduced motion.
-->

# Expense Tracker

A responsive, fast, offline-capable expense tracker that works entirely in the browser using local storage. Data never leaves your device.

## Features
- **Transactions CRUD**: Add, edit, delete expenses and income with an undo feature.
- **Dashboard**: Monthly financial summaries, category breakdown, and spending trends.
- **Budgeting**: Set a monthly budget, monitor progress, and receive warnings at 80% and 100%.
- **Data Management**: Export to CSV, import from JSON, and completely reset data.
- **Views & Search**: Filter by dates, category, and type; search by note text; sort by date or amount.
- **Settings**: Localized currency / number formatting and customizable start-of-week.

## How to Run

1. Open `index.html` in any modern web browser.
2. No build step or local server is strictly required. You can simply double-click the file!

## Data Schema & Storage Versioning

**Storage Key**: `expenseTracker:data`

```ts
type AppData = {
  version: number;
  settings: {
    currency: string;
    budget: number;
    startOfWeek: number; // 0 for Sunday, 1 for Monday
  };
  transactions: Transaction[];
}

type Transaction = {
  id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
  date: string; // ISO string "YYYY-MM-DD"
  note: string;
  paymentMethod: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
```

**Migrations**: Handled in `storage.js`. Future versions of the schema will increment `version` and run migration logic on startup to mutate older structures into the latest schema.

## Manual Test Checklist

1. **Add Transaction**: Ensure validation prevents negative amounts. Add an expense.
2. **Dashboard Math**: Check if "This Month" net is correctly `Income - Expense`. Budget UI updates.
3. **Edit Transaction**: Edit amount; dashboard should react immediately.
4. **Delete & Undo**: Delete a transaction, click undo within 5 seconds. Should reappear.
5. **Filters & Search**: Change date range to last year, ensure lists update. Search for text in a note.
6. **Import/Export**: Export data, edit local storage to clear it, then import JSON. Ensure data returns.
7. **Accessibility**: Tab through the "Add" modal to ensure focus states are visible and traps work.

## Future Improvements

- Recurring transactions automatically applied.
- Dark/Light mode toggle (currently only matte black theme).
- Additional charts with standard Canvas/SVG patterns.
- Multiple budgets (e.g., per category).
