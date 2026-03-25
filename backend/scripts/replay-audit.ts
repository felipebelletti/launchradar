/**
 * Replay audit: run representative tweets from the first DB audit
 * through the updated Stage 1 + shill classifiers to verify filtering.
 */
import { isLaunchAnnouncement, isShillTweet } from '../src/ai/classifier.js';

interface AuditTweet {
  project: string;
  tier: string;
  authorHandle: string;
  authorBio?: string;
  authorFollowers?: number;
  text: string;
  expectedVerdict: 'ACCEPT' | 'REJECT';
  reason: string;
}

const AUDIT_TWEETS: AuditTweet[] = [
  // === The 1 legitimate launch ===
  {
    project: 'ChibiTrumpToken',
    tier: 'TIER_B',
    authorHandle: 'pumpfunwiz',
    authorBio: 'Pumpfun wizard | Memecoin degen | NFA',
    authorFollowers: 1200,
    text: '1 $SOL Giveaway!\n\n$CHIBITRUMP is launching today at 20:00 ETS time on pumpfun.\n\nTo win:\n\n1. Follow @ChibiTrumpToken\n\n2. Repost and like this post.\n\n3. Drop your Solana address below!',
    expectedVerdict: 'REJECT',
    reason: 'Third-party account (pumpfunwiz) promoting @ChibiTrumpToken giveaway — shill pattern',
  },

  // === False positives that SHOULD be rejected ===

  // Venice AI — AI bot replying to random questions, matched "built on Base"
  {
    project: 'Venice AI (VVV)',
    tier: 'TIER_A',
    authorHandle: 'venice_mind',
    text: '@dawjiaw @Agent0ai Agent0ai is an AI agent project built on Base, focused on autonomous on-chain operations and DeFi automation. The team keeps a relatively low profile publicly, but the project emerged from the broader AI agent ecosystem on Base.',
    expectedVerdict: 'REJECT',
    reason: 'Reply/commentary describing another project, not a launch announcement',
  },

  // Alibi Protocol — promotional tweets about existing project
  {
    project: 'Alibi Protocol',
    tier: 'TIER_A',
    authorHandle: 'Alibi_Protocol',
    text: 'Nobody is talking about this yet, so let me.\nOur protocol is built on Solana that lets you:\n→ Cryptographically prove where you were, when you were there → Vault encounters to the blockchain in real-time → Earn tokens just by navigating → Create legal',
    expectedVerdict: 'REJECT',
    reason: 'Promotional content describing existing product, no launch event',
  },

  // Superstate — TradFi commentary about "funds launching soon"
  {
    project: 'Superstate',
    tier: 'TIER_B',
    authorHandle: 'HiltnerJim',
    text: "@dccockfoster There's a few AAA CLO funds onchain right now from @centrifuge @Securitize, @SuperstateInc USCC when basis is better. A number of funds are launching soon that aren't public yet.",
    expectedVerdict: 'REJECT',
    reason: 'Industry commentary, not a specific launch announcement',
  },

  // Hub City / Infinity Rising — video game, not a crypto launch
  {
    project: 'Hub City (Infinity Rising)',
    tier: 'TIER_B',
    authorHandle: 'InfinityRisingX',
    text: '5⃣ Reasons to Watch Cafe Rise 152\n\n1⃣ Alpha launch is imminent\n2⃣ Exclusive early access bundle sale\n3⃣ New cinematic world premiere\n4⃣ Apartment system gameplay revealed\n5⃣ Infinity wallets launching soon',
    expectedVerdict: 'ACCEPT',
    reason: 'Edge case — mentions "launch" and "wallets launching soon", though its a game',
  },

  // Milenium DEX — shipping an update, not a new launch
  {
    project: 'Milenium DEX',
    tier: 'TIER_A',
    authorHandle: 'MileniumVerse',
    text: 'Shipping an update to Milenium DEX.\n\nConnect once. Everything executes on-chain.\n\nBuilt on Solana with automatic transaction signing — no pop-ups, no manual confirmations.\n~200ms end-to-end: route discovery → sign → broadcast.',
    expectedVerdict: 'REJECT',
    reason: 'Update to existing product, not a new launch',
  },

  // Instaclaw — Japanese trader shilling random tokens
  {
    project: 'Instaclaw',
    tier: 'TIER_A',
    authorHandle: 'golocojp',
    text: '#CLAW3D 6倍\n\nちょっとここで部分利確入れて、ALIBIに回してみるけどこれもすごいテックだよね。\n\n日本のAI界隈でも紹介されてたし。',
    expectedVerdict: 'REJECT',
    reason: 'Trading commentary in Japanese, not a launch announcement',
  },

  // Konnex — shill bot spamming $KNX
  {
    project: 'Konnex (KNX)',
    tier: 'TIER_A',
    authorHandle: 'Mulaguy189413',
    text: 'We gave the internet to billions of people.\nNow we\'re giving the economy to machines. \n@konnex_world is making sure that when robots run the world  the value flows back to YOU through $KNX. \nThis is the most important project nobody is talking about.',
    expectedVerdict: 'REJECT',
    reason: 'Shill/promotional content about existing project',
  },

  // Unicorn Fart Dust — shill bot promoting random airdrops
  {
    project: 'Unicorn Fart Dust (UFD)',
    tier: 'TIER_A',
    authorHandle: 'stingejeh',
    authorBio: 'Crypto | Airdrops | Free money 💰',
    authorFollowers: 150,
    text: 'Yo just grabbed a VIP card from @RealBet for free no deposit needed lol 😂 Also copped my airdrop spot from @Aicoin_network1 launching on BSC soon. Don\'t sleep on this alpha! #Crypto #Airdrop',
    expectedVerdict: 'REJECT',
    reason: 'Shill bot promoting multiple unrelated projects',
  },

  // LifeAI — shill account promoting dTelecom testnet
  {
    project: 'LifeAI (DTEL)',
    tier: 'TIER_A',
    authorHandle: 'CoegAgus',
    text: '@dTelecom – Decentralized, AI‑driven real‑time communication built on Solana. Offers sub‑100 ms latency for voice, video, and chat, cuts costs by up to 95 % and ensures end‑to‑end privacy. Open‑source SDKs enable one‑click integration; node operators',
    expectedVerdict: 'REJECT',
    reason: 'Promotional description of existing project, not a launch',
  },

  // River — airdrop farmer tweeting about dozens of projects
  {
    project: 'River',
    tier: 'TIER_A',
    authorHandle: 'AdebsE',
    text: 'Perle Labs is that one friend who walks into chaos with:\n\nA clipboard\nA lie detector\nA zero tolerance for bad data\n\nWhile everyone feeds AI recycled junk…\n\nPerle brings in REAL experts to label data and puts it on-chain.\n\nBuilt on Solana \nFast. Chea',
    expectedVerdict: 'REJECT',
    reason: 'Promotional/shill content about Perle Labs, not a launch announcement',
  },

  // PGA Tour Rise — traditional sports game + shill accounts
  {
    project: 'PGA Tour Rise',
    tier: 'TIER_A',
    authorHandle: 'Yoru_Blaze',
    text: 'With realistic competition, strategic course management, and rewarding weekly progression, PGA Tour Rise delivers the ultimate journey from contender to champion.\n\nCompete. Improve. Climb the leaderboard.\n\nYour rise starts now. #PGATourRise',
    expectedVerdict: 'REJECT',
    reason: 'Game promotion, not a crypto launch',
  },

  // EVECHE/GPAN — shill account spamming $Gpan
  {
    project: 'EVECHE (GPAN)',
    tier: 'TIER_A',
    authorHandle: 'SirVik23',
    text: 'Here comes $Gpan \nA solid panda meme built on bsc chain backed by a very solid community that is committed in pushing this project to the moon 🚀\n\nStill below $100k mcap\nCharts 📈 are clean\nPurely CTO\nNo fear of rugpull or honeypot',
    expectedVerdict: 'REJECT',
    reason: 'Shill — promoting existing token, no launch event',
  },

  // CRFX (CrazyFox) — repetitive shill marketing
  {
    project: 'CRFX (CrazyFox)',
    tier: 'TIER_A',
    authorHandle: 'CrazyFoxMeme',
    text: 'Get ready — we\'re launching on Binance Wallet soon! 🚀\nReforms are rolling out and you can check all the updates now at 👉 https://t.co/GLHJJQiwVU\nThis is just the beginning — keep your fox sharp and stay tuned! 🦊🔥\n\n#CrazyFox #BinanceWallet #crypto',
    expectedVerdict: 'ACCEPT',
    reason: 'Edge case — says "launching on Binance Wallet soon" which is a launch announcement, though vague',
  },

  // === Spectator/fan commentary — should be rejected ===

  // ShubhStacks — spectator excited about someone else's mint
  {
    project: 'ShubhStacks (spectator)',
    tier: 'TIER_B',
    authorHandle: 'ShubhStacks',
    text: 'Degen mint goes live tomorrow 👀\nHow many of you actually secured a WL…\nI want this one so bad😭\n\nEither way, tomorrow\'s gonna be fun.',
    expectedVerdict: 'REJECT',
    reason: 'Fan commentary about another project\'s mint — "I want this one so bad" = spectator, not project',
  },

  // === Legitimate launches that MUST pass ===

  // Clear TGE announcement from project's own account
  {
    project: 'SolanaProject (own account)',
    tier: 'TIER_A',
    authorHandle: 'SolanaProjectXYZ',
    text: 'We are thrilled to announce that $SOLP token launches on Raydium on March 25th at 18:00 UTC. Built on Solana. Whitelist closes tomorrow. Don\'t miss it!',
    expectedVerdict: 'ACCEPT',
    reason: 'Clear launch announcement from project account with date, chain, and platform',
  },

  // Pumpfun stealth launch
  {
    project: 'MemeToken stealth',
    tier: 'TIER_A',
    authorHandle: 'MemeTokenDev',
    text: 'Launching $MEME on pump.fun in 30 minutes. Stealth launch, no presale. CA will be posted here. LFG!',
    expectedVerdict: 'ACCEPT',
    reason: 'Imminent pumpfun launch from dev account',
  },

  // Mint announcement with free mint details
  {
    project: 'NFT collection mint',
    tier: 'TIER_A',
    authorHandle: 'CoolNFTProject',
    text: 'Free mint goes live tomorrow on Ethereum! 5,000 supply. One per wallet. Art by our team. Minting page: https://coolnft.xyz/mint',
    expectedVerdict: 'ACCEPT',
    reason: 'NFT mint announcement with date, chain, supply, and link',
  },

  // Presale announcement
  {
    project: 'DeFi presale',
    tier: 'TIER_B',
    authorHandle: 'NewDeFiProtocol',
    text: 'Our presale starts next Monday on PinkSale. Soft cap 50 SOL, hard cap 200 SOL. Launching on Raydium right after. Audit by CertiK completed.',
    expectedVerdict: 'ACCEPT',
    reason: 'Presale with specific platform, caps, and post-launch plan',
  },

  // Mainnet launch
  {
    project: 'L2 mainnet launch',
    tier: 'TIER_B',
    authorHandle: 'NewL2Chain',
    text: 'After 2 years of building, our mainnet launches next week. Bridge goes live on day 1. 50+ dApps ready to deploy. The future of scaling is here.',
    expectedVerdict: 'ACCEPT',
    reason: 'Mainnet launch announcement with timeline',
  },

  // Airdrop announcement
  {
    project: 'Airdrop claim',
    tier: 'TIER_A',
    authorHandle: 'LayerZeroDev',
    text: '$ZRO airdrop claim goes live June 20th. Check eligibility at layerzero.network/airdrop. Built on Ethereum and supported on all chains.',
    expectedVerdict: 'ACCEPT',
    reason: 'Airdrop with specific date and claim page',
  },

  // BEAST — "snapshot in 12 hours" is NOT a launch date
  {
    project: 'BEAST (snapshot != launch)',
    tier: 'TIER_A',
    authorHandle: 'mebeastXSolana',
    text: 'We are launching soon 🚀 $BEAST is a decentralized meme coin built on #Solana First 4.500 $SOL Address = 200,000 $BEAST Follow like, RT (Drop your $SOL wallet) Snapshot in 12 hours ⏳ #SolanaAirdrop',
    expectedVerdict: 'ACCEPT',
    reason: 'Legitimate launch announcement from project account — but snapshot time should NOT become launchDate',
  },

  // === NEW: Audit 2 false positives ===

  // TheoremNFT — third-party shill promoting another project's handle
  {
    project: 'TheoremNFT (shill)',
    tier: 'TIER_A',
    authorHandle: 'OXsquid_',
    authorBio: 'Web3 alpha hunter | NFT degen',
    authorFollowers: 800,
    text: 'Early alpha \n\n@TheoremNFT is a 1,338 collection launching on Ethereum.\n\nMint price: Free\n\nFounder: @ofalamin https://t.co/eFk42r4xTa',
    expectedVerdict: 'REJECT',
    reason: 'Third-party shill — author is promoting @TheoremNFT, not their own project',
  },

  // StarX Network — tokenomics description, not a launch announcement
  {
    project: 'StarX Network (tokenomics)',
    tier: 'TIER_A',
    authorHandle: 'starxNetwork_',
    text: 'StarX Network is built on Binance Smart Chain with a 90 million total supply and 54 million allocated for miners. KYC is coming this month on the 28th',
    expectedVerdict: 'REJECT',
    reason: 'Tokenomics description (supply, allocation, KYC) — not a launch event',
  },

  // StarX Network — shill account posting near-identical content
  {
    project: 'StarX Network (shill)',
    tier: 'TIER_A',
    authorHandle: 'InnocentItiku',
    text: 'Big moves loading on StarX Network.\nBuilt on BSC with a fixed 90M supply, and over half (54M) reserved for miners\n\nKYC drops on the 28th this month',
    expectedVerdict: 'REJECT',
    reason: 'Shill account rephrasing project tokenomics, not a launch announcement',
  },

  // Moneii — extremely vague "launching soon" from random account
  {
    project: 'Moneii',
    tier: 'TIER_B',
    authorHandle: 'AVarude65065',
    text: 'Moneii: launching soon https://t.co/HKC8mDPweY',
    expectedVerdict: 'REJECT',
    reason: 'Extremely vague — no chain, no date, no details, random account',
  },

  // === Fugabe regressions (2026-03-24) ===

  // Live airdrop with time window — should be accepted (not "already happened")
  {
    project: 'FUGABE (live airdrop)',
    tier: 'TIER_B',
    authorHandle: 'fugabe',
    authorBio: 'fugazzas cancelled will the 2 golden steaks be free?',
    authorFollowers: 50000,
    text: '$FUGABE AIRDROP LIVE:\n\nhttps://t.co/BmNhw1GqPb\n\nyou have 24hrs',
    expectedVerdict: 'ACCEPT',
    reason: 'Currently-live airdrop with 24hr claim window — actionable signal, not a past event',
  },

  // Project own-account with engagement farming — NOT shill
  {
    project: 'FUGABE (own-account engagement farming)',
    tier: 'TIER_B',
    authorHandle: 'fugabe',
    authorBio: 'fugazzas cancelled will the 2 golden steaks be free?',
    authorFollowers: 50000,
    text: '#FUGABE airdrop on Monday:\n\nWen Wallet Cheaker? More info\n\nRT & Drop your Wallet: https://t.co/NGIxcv7Hpi',
    expectedVerdict: 'ACCEPT',
    reason: 'Project own account (@fugabe) announcing #FUGABE airdrop — engagement farming is NOT shill',
  },

  // Alpha/gems shill account promoting another project
  {
    project: 'SCAMTOKEN (alpha call shill)',
    tier: 'TIER_B',
    authorHandle: 'crypto_gems_alpha',
    authorBio: '💎 Best crypto gems | Alpha calls daily | NFA',
    authorFollowers: 25000,
    text: '🚨 ALPHA CALL 🚨\n\n$SCAMTOKEN launching on Solana\nDon\'t sleep on this one\n\n@ScamProject | #Solana | #100x\n\nNFA DYOR',
    expectedVerdict: 'REJECT',
    reason: 'Gems/alpha account promoting another project — classic shill pattern',
  },

  // Whitelist/engagement farming with no launch event
  {
    project: 'FUGABE (whitelist only)',
    tier: 'TIER_B',
    authorHandle: 'fugabe',
    text: 'Imagine waking up to 10 free fugazzas 🍕\n\nYou have 96hrs!\n\n++ apply whitelist\nhttps://t.co/NIwwNANCQ2',
    expectedVerdict: 'REJECT',
    reason: 'Whitelist application / engagement farming — no launch event announced',
  },

  // === WeaveIt / BuildiFi tweets (2026-01-19) ===

  // BuildiFi_AI promoting WeaveIt's token launch — third-party shill
  {
    project: 'WeaveIt (BuildiFi shill)',
    tier: 'TIER_A',
    authorHandle: 'BuildiFi_AI',
    authorBio: 'AI-enabled viable coding infra to democratize startup creation, beyond the vibe code noise (BETA version)\n\nAccelerating this mission by Hack2Launch',
    authorFollowers: 5913,
    text: 'Launch Alert:\n WeaveIt Token $WEAV goes LIVE today at 5 PM UTC.\n\nBuilt for learners, developers, teams, and technical creators who need scale without chaos.\n\nWhat is WeaveIt?\nAn AI-powered video tutorial engine that turns code, docs, and technical systems into narrated explainer videos.\n\nOne input.\nClear explanations.\nShareable learning content.\n\n$WEAV powers the ecosystem:\n⚡ Access to AI video generation credits\n⚡ Discounts on paid plans\n⚡ Governance over product direction\n⚡ Early access to new formats & features\n\nLaunching exclusively on @CyreneAI\nPowered by @BuildiFi_AI\nBuilt on @Solana',
    expectedVerdict: 'REJECT',
    reason: 'Third-party account (BuildiFi_AI) promoting @weaveItAgent $WEAV token — launchpad shill, not the project itself',
  },

  // weaveItAgent announcing their own token is live — legitimate
  {
    project: 'WeaveIt (own account, live token)',
    tier: 'TIER_A',
    authorHandle: 'weaveItAgent',
    authorBio: 'Unlocking access to technical learning\n\nCA: 12iiZxCVW7bjGEV8ao4Kq9jt4nzEtRZ94nfutuApcyai',
    authorFollowers: 533,
    text: '$WEAV Token is LIVE on Solana!\n\nCA: 12iiZxCVW7bjGEV8ao4Kq9jt4nzEtRZ94nfutuApcyai\n\nWe\'re excited to announce that the WeaveIt ($WEAV) token is officially live on the @CyreneAI launchpad.\n\n$WEAV powers the WeaveIt ecosystem — enabling access to AI-powered learning tools, product participation, and the future of structured technical creation.\n\nJoin the sale and be part of how developers, educators, and teams learn and build at scale.',
    expectedVerdict: 'ACCEPT',
    reason: 'Project own account (@weaveItAgent) announcing $WEAV token is live on Solana with CA — legitimate launch',
  },

  // === WandrLust / AFK tweets (2026-03-24) ===

  // Random user reposting WandrLust's TGE info — third-party shill
  {
    project: 'AFK / WandrLust (third-party shill)',
    tier: 'TIER_A',
    authorHandle: 'AbdulHa87710579',
    authorBio: '@CNPYNetwork EmoFi',
    authorFollowers: 382,
    text: '$AFK is built on Base.\n\nFast, low-cost onchain infrastructure for the WandrLust app infrastructure.\n\n$AFK is the incentive mechanism and token enabling the Presence Economy.\n\nTGE: 25 March\n\nMore launch details soon!',
    expectedVerdict: 'REJECT',
    reason: 'Random user (382 followers, bio "@CNPYNetwork EmoFi") rephrasing WandrLust $AFK TGE details — not the project account',
  },

  // CaptchaApp — existing product asking for feedback, not a launch
  {
    project: 'CaptchaApp (existing product feedback)',
    tier: 'TIER_A',
    authorHandle: 'CaptchaApp',
    text: '5/ built on Solana under the hood. try it out and give us your feedback! sign up as an agent at http://captcha.social or get the app at https://apps.apple.com/us/app/captcha-anti-slop-app/id6759180163',
    expectedVerdict: 'REJECT',
    reason: 'Existing product asking for feedback — "try it out" implies already live, no launch event',
  },

  // CaptchaApp — posting token CA means token is live
  {
    project: 'CaptchaApp (token CA announcement)',
    tier: 'TIER_A',
    authorHandle: 'CaptchaApp',
    text: '6/ our token CA is FtSRgyCEhKTc1PPgEAXvuHN3NyiP6LS9uyB28KCN3CAP\n\nbe careful out there!',
    expectedVerdict: 'ACCEPT',
    reason: 'Project own account posting their token contract address — token is live',
  },

  // LEGACY — project own account posting token CA (pump.fun)
  {
    project: 'LEGACY (own account CA post)',
    tier: 'TIER_A',
    authorHandle: 'legacycoincto',
    authorBio: 'dont be sad its over, be thankful it happened\n\nits about the journey, not the destination 👑',
    authorFollowers: 270,
    text: "Don't be sad its over, be thankful it happened.\n\n$LEGACY\n\nCA: DnjT8CjdxUCBhDjv2fW6w6b7w3JRRhfRwEnP8Kiapump",
    expectedVerdict: 'ACCEPT',
    reason: 'Project own account posting token CA — token is live on pump.fun',
  },

  // WandrLust own account announcing $AFK TGE — legitimate
  {
    project: 'AFK / WandrLust (own account TGE)',
    tier: 'TIER_B',
    authorHandle: 'WandrLust_io',
    authorBio: 'A mobile app that rewards real-life activity, built on-chain. AI verifies it. Brands fund it. Earn $AFK. AI developed with @CSIRO and @Data61news. iOS Beta Live',
    authorFollowers: 73700,
    text: 'Excited to be working with @MEXC_Official as we prepare for the launch of $AFK on 25th March, the utility token powering the WandrLust Presence Economy.\n\nLaunch infrastructure includes Aerodrome (DEX) and MEXC (CEX).\n\nMore launch details coming soon. 🌍',
    expectedVerdict: 'ACCEPT',
    reason: 'Project own account (@WandrLust_io, 73K followers) announcing $AFK TGE with date, DEX, and CEX details',
  },
];

async function main() {
  console.log('=== REPLAY AUDIT: Testing tweets against updated classifiers ===\n');

  let correct = 0;
  let wrong = 0;
  const results: Array<{ project: string; stage1: boolean; shill: boolean; finalVerdict: string; expected: string; match: boolean }> = [];

  for (const tweet of AUDIT_TWEETS) {
    const stage1 = await isLaunchAnnouncement(tweet.text, '');
    let shill = false;
    if (stage1) {
      shill = await isShillTweet(tweet.text, '', tweet.authorHandle, tweet.authorBio ?? '', tweet.authorFollowers);
    }

    const accepted = stage1 && !shill;
    const verdict = accepted ? 'ACCEPT' : 'REJECT';
    const match = verdict === tweet.expectedVerdict;

    if (match) correct++;
    else wrong++;

    const icon = match ? '✅' : '❌';
    const stage1Icon = stage1 ? 'PASS' : 'FAIL';
    const shillIcon = shill ? 'YES' : 'NO';

    console.log(`${icon} ${tweet.project} (${tweet.tier})`);
    console.log(`   Stage 1: ${stage1Icon} | Shill: ${shillIcon} | Verdict: ${verdict} | Expected: ${tweet.expectedVerdict}`);
    if (!match) {
      console.log(`   ⚠️  MISMATCH — ${tweet.reason}`);
      console.log(`   Tweet: "${tweet.text.substring(0, 100)}..."`);
    }
    console.log('');

    results.push({ project: tweet.project, stage1, shill, finalVerdict: verdict, expected: tweet.expectedVerdict, match });
  }

  console.log('=== SUMMARY ===');
  console.log(`Correct: ${correct}/${AUDIT_TWEETS.length}`);
  console.log(`Wrong:   ${wrong}/${AUDIT_TWEETS.length}`);
  console.log(`Accuracy: ${((correct / AUDIT_TWEETS.length) * 100).toFixed(0)}%`);

  const falseAccepts = results.filter(r => !r.match && r.finalVerdict === 'ACCEPT');
  const falseRejects = results.filter(r => !r.match && r.finalVerdict === 'REJECT');

  if (falseAccepts.length > 0) {
    console.log(`\nFalse accepts (should be rejected but passed): ${falseAccepts.map(r => r.project).join(', ')}`);
  }
  if (falseRejects.length > 0) {
    console.log(`\nFalse rejects (should be accepted but filtered): ${falseRejects.map(r => r.project).join(', ')}`);
  }
}

main().catch(console.error);
