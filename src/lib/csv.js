/**
 * @module csv
 * @description CSV building and download, shared by the Settings export and
 * the Dashboard reports.
 */

/**
 * Quotes one cell. Numbers stay bare so spreadsheets read them as numbers.
 * Text starting with = + - or @ gets a leading quote so spreadsheets show
 * it exactly as typed instead of treating it as a formula.
 */
export function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const str = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** @param {Array<Array<*>>} rows - First row is the header */
export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export const EXPENSE_HEADERS = ['Date', 'Item', 'Amount', 'Currency', 'Category', 'People', 'Raw Input'];

export function expenseRow(exp) {
  return [
    exp.date,
    exp.item,
    exp.amount,
    exp.currency,
    exp.category,
    (exp.people || []).join(', '),
    exp.raw,
  ];
}

/** The full expense list as CSV, oldest first so it reads like a ledger. */
export function expensesToCsv(expenses) {
  const sorted = [...expenses].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0),
  );
  return toCsv([EXPENSE_HEADERS, ...sorted.map(expenseRow)]);
}

/**
 * Hands the browser a CSV file to save. The byte-order mark makes Excel open
 * it as UTF-8, so names and item text outside ASCII survive.
 */
export function downloadCsv(filename, content) {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking synchronously can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
