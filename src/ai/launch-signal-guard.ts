const PRICE_OR_RECAP_PATTERNS: RegExp[] = [
  /\bwithin\s+\d+\s*(?:hours?|hrs?|days?)\s+after\b/i,
  /\bafter\s+launching\b/i,
  /\b(?:surge|surges|surged|soared)\s+\d+(?:\.\d+)?\s*%/i,
  /\d+(?:\.\d+)?\s*%\s+within\s+\d+\s*(?:hours?|hrs?|days?)\b/i,
  /\b(?:pump(?:ed|s|ing)?|rally|rallied)\b[^%\n]{0,120}\d+\s*%/i,
];

export function isLikelyPriceRecapNotUpcomingLaunch(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return PRICE_OR_RECAP_PATTERNS.some((re) => re.test(t));
}
