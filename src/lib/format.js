const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const formatCurrency = (value) => Number.isFinite(value) ? currency.format(value) : 'Not available';
export const formatCompactCurrency = (value) => Number.isFinite(value) ? compactCurrency.format(value) : 'N/A';
export const formatNumber = (value) => Number.isFinite(value) ? number.format(value) : 'N/A';
export const formatPercent = (value, digits = 1) => Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : 'N/A';
export const formatRatio = (value) => Number.isFinite(value) ? `${value.toFixed(3)}x` : 'N/A';
export const formatSignedCurrency = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : '−'}${currency.format(Math.abs(value))}` : 'N/A';
