/**
 * Chart colors. Validated with the dataviz palette checker against the glass
 * card surface (#191a22, dark): primary + secondary pass lightness band,
 * chroma floor, CVD separation (ΔE 31.7 protan) and 3:1 contrast.
 *
 * - primary   — the period being reported (app accent)
 * - secondary — a derived series on top of it (7-day average, "variable")
 * - context   — the comparison period; gray so it recedes behind the data
 *
 * Category bars use `primary` only. Hue there would re-encode what the label
 * already says, and nine hues can't be told apart under color blindness.
 */
export const SERIES = {
  primary: '#7c5cfc',
  primaryHover: '#9479fd',
  primaryWash: 'rgba(124, 92, 252, 0.12)',
  secondary: '#d95926',
  context: '#8b8d9e',
  reference: 'rgba(240, 240, 245, 0.45)',
  grid: 'rgba(255, 255, 255, 0.06)',
  axis: 'rgba(255, 255, 255, 0.12)',
  surface: 'rgba(25, 26, 34, 0.92)',
  textPrimary: '#f0f0f5',
  textSecondary: '#8b8d9e',
  textMuted: '#8b8d9e',
};
