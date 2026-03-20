import { describe, expect, it } from 'vitest';
import { isLikelyPriceRecapNotUpcomingLaunch } from '../ai/launch-signal-guard.js';

describe('isLikelyPriceRecapNotUpcomingLaunch', () => {
  it('detects surge + percent within hours recap', () => {
    const t = `JUST IN: $LOL surges 895% within 24 hours after launching on PumpFun, aims to become a leading memecoin on Solana.`;
    expect(isLikelyPriceRecapNotUpcomingLaunch(t)).toBe(true);
  });

  it('detects after launching phrase', () => {
    expect(isLikelyPriceRecapNotUpcomingLaunch('Big moves after launching on Base')).toBe(true);
  });

  it('does not flag a future launch teaser', () => {
    expect(
      isLikelyPriceRecapNotUpcomingLaunch(
        'We launch the $PEPE presale on Solana this Friday — set a reminder.',
      ),
    ).toBe(false);
  });
});
