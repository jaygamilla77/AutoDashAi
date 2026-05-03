/**
 * Statistical Analysis Service
 *
 * Pure, dependency-free numerical analysis on series/columns. Used by
 * aiInsightService to ground LLM narratives in defensible math, and by
 * the renderer to surface anomalies/forecasts without an AI round-trip.
 *
 * All inputs are coerced to Number; non-finite values are filtered.
 */

'use strict';

// ─── Coercion helpers ────────────────────────────────────────────────────────
function toNumbers(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function sum(arr)  { return arr.reduce((s, v) => s + v, 0); }
function mean(arr) { return arr.length ? sum(arr) / arr.length : 0; }
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─── Concentration / inequality (Herfindahl-Hirschman index) ────────────────
/**
 * Herfindahl-Hirschman Index: 0 = perfectly distributed, 1 = single dominator.
 * Returns { hhi, top1Share, top3Share, dominantLabel } for a labels/values pair.
 */
function concentration(labels, values) {
  const nums = toNumbers(values);
  const total = sum(nums);
  if (total <= 0 || nums.length === 0) return { hhi: 0, top1Share: 0, top3Share: 0, dominantLabel: null };
  const shares = nums.map(v => v / total);
  const hhi = shares.reduce((s, p) => s + p * p, 0);
  const sorted = labels.map((l, i) => ({ label: l, share: shares[i] || 0 }))
    .sort((a, b) => b.share - a.share);
  return {
    hhi,
    top1Share: sorted[0] ? sorted[0].share : 0,
    top3Share: sorted.slice(0, 3).reduce((s, x) => s + x.share, 0),
    dominantLabel: sorted[0] ? sorted[0].label : null,
  };
}

// ─── Trend detection (modified Mann-Kendall sign test) ──────────────────────
/**
 * Returns { direction: 'up'|'down'|'flat', strength: 0..1, slope, pctChange }.
 * Uses sign-test plus first/last delta. Lightweight: O(n).
 */
function trend(values) {
  const nums = toNumbers(values);
  if (nums.length < 2) return { direction: 'flat', strength: 0, slope: 0, pctChange: 0 };
  let up = 0, down = 0;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > nums[i - 1]) up++;
    else if (nums[i] < nums[i - 1]) down++;
  }
  const totalSteps = nums.length - 1;
  const netSign = (up - down) / totalSteps; // -1..1
  const first = nums[0], last = nums[nums.length - 1];
  const slope = (last - first) / totalSteps;
  const pctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  let direction = 'flat';
  if (Math.abs(netSign) >= 0.4 || Math.abs(pctChange) >= 5) {
    direction = netSign >= 0 ? 'up' : 'down';
  }
  return { direction, strength: Math.min(1, Math.abs(netSign)), slope, pctChange };
}

// ─── Outlier detection ──────────────────────────────────────────────────────
/**
 * Z-score outliers: indices where |value - mean| / stddev > threshold.
 * Default threshold = 2 (95% interval).
 */
function zScoreOutliers(values, threshold = 2) {
  const nums = toNumbers(values);
  if (nums.length < 3) return [];
  const m = mean(nums);
  const sd = stddev(nums);
  if (sd === 0) return [];
  const out = [];
  values.forEach((raw, i) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const z = (v - m) / sd;
    if (Math.abs(z) > threshold) out.push({ index: i, value: v, z });
  });
  return out;
}

/**
 * IQR-based outliers (more robust than z-score for skewed data).
 */
function iqrOutliers(values, k = 1.5) {
  const nums = toNumbers(values);
  if (nums.length < 4) return [];
  const sorted = nums.slice().sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - k * iqr, hi = q3 + k * iqr;
  const out = [];
  values.forEach((raw, i) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    if (v < lo || v > hi) out.push({ index: i, value: v, side: v < lo ? 'low' : 'high' });
  });
  return out;
}

// ─── Period-over-period delta (assumes ordered series) ──────────────────────
/**
 * Compares the most recent point to the previous point.
 * Returns { current, previous, delta, pctChange }.
 */
function periodOverPeriod(values) {
  const nums = toNumbers(values);
  if (nums.length < 2) return null;
  const current = nums[nums.length - 1];
  const previous = nums[nums.length - 2];
  const delta = current - previous;
  const pctChange = previous !== 0 ? (delta / Math.abs(previous)) * 100 : 0;
  return { current, previous, delta, pctChange };
}

// ─── Lightweight Pearson correlation ────────────────────────────────────────
function correlation(seriesA, seriesB) {
  const a = toNumbers(seriesA);
  const b = toNumbers(seriesB);
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

// ─── Master profiler — single entry point ───────────────────────────────────
/**
 * Profile a panel's series. Returns a compact stats payload suitable for
 * embedding in an LLM prompt OR rendering badges directly.
 */
function profilePanel(panel) {
  const labels = Array.isArray(panel && panel.labels) ? panel.labels : [];
  const values = Array.isArray(panel && panel.values) ? panel.values : [];
  const nums   = toNumbers(values);
  if (!nums.length) return null;

  const conc   = concentration(labels, values);
  const tr     = trend(values);
  const z      = zScoreOutliers(values, 2);
  const pop    = periodOverPeriod(values);

  // Risk classification — pure rules, no AI.
  let riskLevel = 'LOW';
  const flags = [];
  if (conc.top1Share >= 0.6) {
    riskLevel = 'HIGH';
    flags.push('CONCENTRATION');
  } else if (conc.top1Share >= 0.4) {
    riskLevel = 'MEDIUM';
    flags.push('CONCENTRATION');
  }
  if (tr.direction === 'down' && Math.abs(tr.pctChange) >= 15) {
    riskLevel = riskLevel === 'HIGH' ? 'CRITICAL' : 'HIGH';
    flags.push('DECLINE');
  }
  if (z.length >= 2) {
    if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    flags.push('OUTLIERS');
  }
  if (pop && Math.abs(pop.pctChange) >= 30) {
    if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    flags.push('SHOCK');
  }

  return {
    count: nums.length,
    sum: sum(nums),
    mean: mean(nums),
    median: median(nums),
    stddev: stddev(nums),
    min: Math.min.apply(null, nums),
    max: Math.max.apply(null, nums),
    concentration: conc,
    trend: tr,
    outliers: z,
    periodOverPeriod: pop,
    riskLevel,
    flags,
  };
}

module.exports = {
  toNumbers,
  sum, mean, stddev, median,
  concentration,
  trend,
  zScoreOutliers,
  iqrOutliers,
  periodOverPeriod,
  correlation,
  profilePanel,
};
