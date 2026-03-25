import { xaiClient, GROK_MODEL } from './client.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('ai:classifier');

// Regex patterns for contract addresses
const ETH_CA_RE = /\b0x[a-fA-F0-9]{40}\b/;
const SOL_CA_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

// Denial phrases that indicate a scam warning, not a launch
const CA_DENIAL_RE = /\b(not us|not our|isn't us|isn't our|is still|is till|didn't launch|did report|beware of scam|that's not our)\b/i;

/**
 * Heuristic: if tweet contains a contract address without denial language,
 * it's a launch signal — skip the LLM call entirely.
 * Returns true (accept), false (deny — has denial language), or null (no CA found, use LLM).
 */
function caHeuristic(tweetText: string, ocrText: string): boolean | null {
  const blob = `${tweetText}\n${ocrText}`;
  const hasCA = ETH_CA_RE.test(blob) || SOL_CA_RE.test(blob);
  if (!hasCA) return null; // no CA found, let the LLM decide
  if (CA_DENIAL_RE.test(blob)) return false; // CA + denial = scam warning
  return true; // CA + no denial = launch signal
}

export async function isLaunchAnnouncement(
  tweetText: string,
  ocrText: string
): Promise<boolean> {
  // Fast path: CA heuristic — deterministic, no LLM call needed
  const caResult = caHeuristic(tweetText, ocrText);
  if (caResult !== null) {
    log.debug('Stage 1 result (CA heuristic)', { result: caResult, hasDenial: !caResult });
    return caResult;
  }

  const userContent = [
    `Does this tweet announce, tease, or describe a specific crypto go-live event: token listing, presale, mint, TGE, mainnet launch, airdrop claim, or similar? The event can be UPCOMING or CURRENTLY LIVE (e.g. "airdrop live now", "mint is open", "claim live"). Reply only "YES" or "NO".`,
    ``,
    `Say YES if the tweet explicitly states a project/token IS LAUNCHING, WILL LAUNCH, or HAS JUST GONE LIVE, even if it also contains airdrop bait, engagement farming ("RT + Like"), or hype language. The key signal is "launching on [platform/chain]", "launching [date]", "airdrop live", "mint is live", or "[ticker] LIVE" paired with a project/token name or ticker. Also YES if the tweet shares a token contract address (CA) — posting a CA means the token is live or about to be live.`,
    ``,
    `Say NO for:`,
    `- Price or performance news (surges, gains, % up, "within 24h after"), market recaps, "JUST IN" trading headlines`,
    `- Launches or listings that happened LONG AGO (days/weeks/months) — but a launch that is CURRENTLY LIVE or just went live TODAY is YES`,
    `- Updates, patches, or new features shipping for an EXISTING live product (e.g. "shipping an update", "new version", "v2 is live")`,
    `- Vague hype with ZERO launch info ("big news coming", "stay tuned", "something exciting") — no platform, no date, no chain, no mechanism mentioned`,
    `- Promotional/shill content that merely DESCRIBES an existing project ("built on Solana", "our protocol does X") without announcing a launch event`,
    `- Tokenomics descriptions: total supply, allocation, mining details, KYC plans — these describe a project's structure, not a launch event`,
    `- Fan/spectator commentary about someone else's launch — the author is NOT the project team and is just expressing excitement as a user (e.g. "I want this one so bad", "who secured a WL?", "how many of you got a WL", "this is gonna be huge"). Key sign: the author does not name their OWN project or use "we/our"`,
    `- Replies, commentary, or opinions about other projects — not a launch announcement from the project itself`,
    `- Scam warnings or CA clarification replies where the author DENIES a launch or corrects misinformation — key phrases: "this is not us", "that's not our CA", "our CA is still" (the word "still" implies correction, not announcement), "we didn't launch this", "not our token". These are defensive replies to scam alerts, NOT launch announcements. Note: a project simply posting "our CA is [address]" WITHOUT denial language IS a launch signal — only reject when there is explicit denial or correction framing`,
    `- General industry discussion, educational content, or market commentary`,
    ``,
    `Tweet: "${tweetText}"`,
    ocrText ? `Image text: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      temperature: 0,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only "YES" or "NO".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? 'NO').trim().toUpperCase();
    const result = text === 'YES';

    const usage = response.usage as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    log.debug('Stage 1 result', {
      result,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    return result;
  } catch (err) {
    log.error('Stage 1 classifier error', { err, durationMs: Date.now() - start });
    return false;
  }
}

export type LaunchTiming = 'future' | 'live' | 'unknown';

function hasPumpFunLink(tweetText: string, ocrText: string): boolean {
  const s = `${tweetText}\n${ocrText}`.toLowerCase();
  if (/\bpump\.fun\//.test(s)) return true;
  if (/(?:https?:\/\/)(?:www\.)?pump\.fun\b/.test(s)) return true;
  return false;
}

export async function classifyLaunchTiming(
  tweetText: string,
  ocrText: string
): Promise<LaunchTiming> {
  if (hasPumpFunLink(tweetText, ocrText)) {
    log.debug('Launch timing: pump.fun URL → live (heuristic)');
    return 'live';
  }

  const userContent = [
    `Classify this tweet based on the PROJECT/TOKEN LAUNCH status (not features, rewards, or campaigns):`,
    `- "future" the project/token/protocol itself is announcing it will launch soon or on a specific date`,
    `- "live" the project/token/protocol itself has just launched or its token just went live`,
    `- "unknown" cannot determine, or the tweet is about a feature/reward/campaign going live (not the project launch itself)`,
    ``,
    `Tweet: "${tweetText}"`,
    ocrText ? `[Image text]: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      temperature: 0,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only one word: "future", "live", or "unknown".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? '').trim().toLowerCase();

    const usage = response.usage as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    log.debug('Launch timing result', {
      result: text,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    if (text === 'live') return 'live';
    if (text === 'future') return 'future';
    return 'unknown';
  } catch (err) {
    log.error('Launch timing classifier error', { err, durationMs: Date.now() - start });
    return 'unknown';
  }
}

export async function isShillTweet(
  tweetText: string,
  ocrText: string,
  authorHandle?: string,
  authorBio?: string,
  authorFollowers?: number
): Promise<boolean> {
  const userContent = [
    `Is this tweet a shill, bot-bait, or spam? Reply with only "YES" or "NO".`,
    ``,
    `Say YES if the tweet:`,
    `- Reads like a keyword list or hashtag dump rather than a real announcement`,
    `- Uses pipe separators, slash lists, or bullet-like formatting to cram in multiple launch keywords`,
    `- Has no real sentence structure — just tokens, buzzwords, and ticker symbols strung together`,
    `- Appears designed to trigger keyword-monitoring bots rather than inform humans`,
    `- Promotes buying a token rather than announcing a project milestone`,
    `- Promotes ANOTHER project's @handle, $ticker, or name — the author is a promotion/gems/alpha account posting about someone else's token, not announcing their own project`,
    `- Uses "alpha" framing to promote a project the author is not part of (e.g. "Early alpha", "alpha call", "don't sleep on")`,
    `- Is from a "crypto gems" or "crypto calls" type account that aggregates and promotes other people's tokens`,
    `- The author's bio describes a DIFFERENT project, platform, or purpose than the $ticker or project being announced in the tweet — this indicates the author is promoting someone else's launch, not their own`,
    `- The author's handle looks auto-generated or default (e.g. name followed by random digits like "User12345678") AND the handle has no resemblance to the project/ticker — strong indicator of a low-effort shill or bot account`,
    `- The author is a launchpad, accelerator, or platform account (e.g. "Powering the builder economy", "IDO platform") announcing a client project's token — the launchpad is not the project itself`,
    `- Uses a referral or invite template for another platform/project — phrases like "Just reserved @myname on @ProjectX", "Just signed up for @ProjectX", "Got my spot on @ProjectX", or similar user-generated referral content where the author is clearly a user of someone else's product, not the product team itself`,
    `- The tweet mentions a specific project @handle (e.g. @Cheesepayxyz, @SomeProject) and the author's handle has NO resemblance to that project — strong indicator the author is promoting someone else's product, not their own`,
    ``,
    `Say NO if the tweet:`,
    `- The tweet author's handle matches or closely resembles a $ticker or #hashtag mentioned in the tweet — this strongly indicates the project's OWN account, not a shill. For example, @fugabe tweeting about $FUGABE, @legacycoincto tweeting about $LEGACY, or @CaptchaApp tweeting about Captcha is the project itself. The handle may contain suffixes like "cto", "dev", "official", "app", "xyz", "io" — strip these when comparing`,
    `- The author's bio mentions the same project, $ticker, or product being announced in the tweet — confirms this is the project's own account`,
    `- Is a genuine announcement from the project's OWN account about THEIR launch — even if it uses engagement farming tactics like "RT & Like", "Drop your wallet", or "Tag friends". Many legitimate small crypto projects use these tactics; engagement farming alone does NOT make a tweet shill`,
    `- Contains the project's own $ticker or #name AND announces a launch event (date, airdrop, mint, presale)`,
    `- Contains actual information about a launch (date, chain, features, links) AND is from the project itself`,
    `- Shares a token contract address (CA) — whether using first-person language ("our token CA", "our CA is") or simply posting "CA: <address>" alongside their own $ticker. If the author's handle matches or resembles the project/ticker in the tweet, this is the project posting their own CA, not a shill`,
    `- Reads like something a real project team would write to inform their followers`,
    ``,
    authorHandle ? `Author handle: @${authorHandle}` : null,
    authorBio ? `Author bio: "${authorBio}"` : null,
    authorFollowers != null ? `Author followers: ${authorFollowers}` : null,
    `Tweet: "${tweetText}"`,
    ocrText ? `Image text: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      temperature: 0,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only "YES" or "NO".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? 'NO').trim().toUpperCase();
    const result = text === 'YES';

    const usage = response.usage as {
      input_tokens?: number; output_tokens?: number;
      prompt_tokens?: number; completion_tokens?: number;
    } | undefined;

    log.debug('Shill detection result', {
      result,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    return result;
  } catch (err) {
    log.error('Shill detector error', { err, durationMs: Date.now() - start });
    return false; // safe default: don't discard on error
  }
}

export async function isCryptoRelated(
  tweetText: string,
  authorBio: string,
  ocrText: string
): Promise<boolean> {
  const userContent = [
    `Is this tweet related to a cryptocurrency, token, NFT, DeFi protocol, blockchain network, or Web3 project? Reply with only "YES" or "NO".`,
    ``,
    `Tweet: "${tweetText}"`,
    `Author bio: "${authorBio}"`,
    ocrText ? `Image text: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      temperature: 0,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only "YES" or "NO".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? 'NO').trim().toUpperCase();
    const result = text === 'YES';

    const usage = response.usage as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    log.debug('Stage 2 result', {
      result,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    return result;
  } catch (err) {
    log.error('Stage 2 classifier error', { err, durationMs: Date.now() - start });
    return false;
  }
}
