/**
 * Canonical platform definitions for LaunchRadar.
 *
 * "Platform" covers both L1/L2 chains (Solana, Ethereum, Base) and
 * launch venues (Pump.fun, DaosFun). Every platform value stored in the
 * database MUST be one of the canonical names defined here.
 */

// ─── Canonical Platform List ────────────────────────────────
// This is the single source of truth. Add new platforms here.

export const SUPPORTED_PLATFORMS = [
  'Solana',
  'Ethereum',
  'Base',
  'BSC',
  'Arbitrum',
  'Optimism',
  'Polygon',
  'Avalanche',
  'Sui',
  'Aptos',
  'TON',
  'Pump.fun',
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

const PLATFORM_SET = new Set<string>(
  SUPPORTED_PLATFORMS.map((p) => p.toLowerCase()),
);

// ─── Alias Map ──────────────────────────────────────────────
// Maps common variations / abbreviations to canonical names.

const PLATFORM_ALIASES: Record<string, SupportedPlatform> = {
  sol: 'Solana',
  solana: 'Solana',
  eth: 'Ethereum',
  ethereum: 'Ethereum',
  base: 'Base',
  bsc: 'BSC',
  bnb: 'BSC',
  binance: 'BSC',
  polygon: 'Polygon',
  matic: 'Polygon',
  avalanche: 'Avalanche',
  avax: 'Avalanche',
  arbitrum: 'Arbitrum',
  arb: 'Arbitrum',
  optimism: 'Optimism',
  op: 'Optimism',
  sui: 'Sui',
  aptos: 'Aptos',
  apt: 'Aptos',
  ton: 'TON',
  toncoin: 'TON',
  'pump.fun': 'Pump.fun',
  pumpfun: 'Pump.fun',
  pump: 'Pump.fun',
};

// ─── Helpers ────────────────────────────────────────────────

/**
 * Normalize a raw platform string to its canonical name.
 * Returns the canonical name if recognized, or `null` if unknown.
 */
export function normalizePlatform(raw: string): SupportedPlatform | null {
  const key = raw.toLowerCase().trim();
  if (PLATFORM_ALIASES[key]) return PLATFORM_ALIASES[key];
  // Direct match against canonical names (case-insensitive)
  if (PLATFORM_SET.has(key)) {
    return SUPPORTED_PLATFORMS.find((p) => p.toLowerCase() === key) ?? null;
  }
  return null;
}

/**
 * Validate and normalize an array of raw platform strings.
 * Returns only recognized platforms (deduplicated, order preserved).
 * Unknown values are returned separately for suggestion tracking.
 */
export function validatePlatforms(raw: string[]): {
  platforms: SupportedPlatform[];
  unknown: string[];
} {
  const platforms: SupportedPlatform[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const r of raw) {
    const trimmed = r.trim();
    if (!trimmed) continue;

    const normalized = normalizePlatform(trimmed);
    if (normalized && !seen.has(normalized)) {
      platforms.push(normalized);
      seen.add(normalized);
    } else if (!normalized) {
      unknown.push(trimmed);
    }
  }

  return { platforms, unknown };
}

/**
 * The comma-separated list used in the LLM extraction prompt.
 */
export const PLATFORM_PROMPT_LIST = SUPPORTED_PLATFORMS.join(', ');
