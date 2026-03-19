import type { Redis } from 'ioredis';
import { config } from '../config.js';
import { prisma } from '../db/client.js';
import * as twitterApi from './twitterapi.service.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('rule-manager');

const REDIS_KEY_ACTIVE_RULE_COUNT = 'rule:active_count';
const REDIS_KEY_MAX_RULES = 'rule:max_rules';
const RULE_SLOT_BUFFER = 5; // Keep this many slots free as a safety buffer

// Static rule definitions
const TIER_A_RULES = [
  {
    label: 'chain_sol',
    filter:
      '("launching on solana" OR "launching on #solana" OR "launching on sol" OR "launching on #sol" OR "built on solana" OR "built on #solana") -is:retweet lang:en',
  },
  {
    label: 'chain_eth',
    filter:
      '("launching on ethereum" OR "launching on #ethereum" OR "built on ethereum" OR "built on #ethereum" OR "launching on base" OR "launching on #base" OR "built on base" OR "built on #base") -is:retweet lang:en',
  },
  {
    label: 'chain_bsc',
    filter:
      '("launching on binance" OR "launching on #binance" OR "launching on bsc" OR "launching on #bsc" OR "built on binance" OR "built on bsc" OR "built on #binance" OR "built on #bsc") -is:retweet lang:en',
  },
  {
    label: 'chain_pump',
    filter:
      '("launching on pump.fun" OR "launching on pumpfun") -is:retweet lang:en',
  },
];

const TIER_B_RULES = [
  {
    label: 'time_signals',
    filter:
      '("launching tomorrow" OR "launching soon" OR "launching today" OR "goes live tomorrow" OR "goes live soon" OR "launching next week") -is:retweet lang:en',
  },
];

export class RuleManagerService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Fetch active rules from twitterapi.io, store count and max in Redis.
   * Called once on startup.
   */
  async initialize(): Promise<void> {
    try {
      const [rulesData, maxRules] = await Promise.all([
        twitterApi.listRules(),
        twitterApi.getMaxRules(),
      ]);

      const activeCount = rulesData.rules?.length ?? 0;

      await this.redis.set(REDIS_KEY_ACTIVE_RULE_COUNT, activeCount);
      await this.redis.set(REDIS_KEY_MAX_RULES, maxRules);

      log.info('RuleManager initialized', { activeCount, maxRules });
    } catch (err) {
      log.error('RuleManager initialization error', { err });
      // Set safe defaults so we can still operate
      await this.redis.set(REDIS_KEY_ACTIVE_RULE_COUNT, 0);
      await this.redis.set(REDIS_KEY_MAX_RULES, 50);
    }
  }

  /**
   * Idempotently register static Tier A + Tier B rules.
   * Skips a rule if one with the same label already exists.
   */
  async registerStaticRules(): Promise<void> {
    let existingLabels: Set<string>;
    try {
      const rulesData = await twitterApi.listRules();
      existingLabels = new Set((rulesData.rules ?? []).map(r => r.label));
    } catch (err) {
      log.error('Failed to fetch existing rules for static registration', { err });
      existingLabels = new Set();
    }

    const allStaticRules = [...TIER_A_RULES, ...TIER_B_RULES];

    for (const rule of allStaticRules) {
      if (existingLabels.has(rule.label)) {
        log.debug('Static rule already exists, skipping', { label: rule.label });
        continue;
      }

      try {
        await twitterApi.createRule(
          rule.label,
          rule.filter,
          config.WEBHOOK_POLL_INTERVAL_SECONDS
        );
        await this.redis.incr(REDIS_KEY_ACTIVE_RULE_COUNT);
        log.info('Registered static rule', { label: rule.label });
      } catch (err) {
        log.error('Failed to register static rule', { label: rule.label, err });
      }
    }
  }

  /**
   * Register a Tier C per-account monitoring rule.
   * If at capacity, marks the account as queued instead.
   */
  async registerAccountMonitor(
    twitterHandle: string,
    launchRecordId: string
  ): Promise<void> {
    // Check if already monitored
    const existing = await prisma.monitoredAccount.findUnique({
      where: { twitterHandle },
    });

    if (existing?.active) {
      log.debug('Account already actively monitored', { twitterHandle });
      return;
    }

    // Check capacity
    const hasCapacity = await this.hasRuleCapacity();

    if (!hasCapacity) {
      log.info('Rule capacity full, queuing account', { twitterHandle });
      await prisma.monitoredAccount.upsert({
        where: { twitterHandle },
        create: {
          twitterHandle,
          launchRecordId,
          active: false,
          queued: true,
        },
        update: {
          queued: true,
          launchRecordId,
        },
      });
      return;
    }

    try {
      const filter = `from:${twitterHandle} -is:retweet`;
      const rule = await twitterApi.createRule(
        `account_${twitterHandle}`,
        filter,
        config.TIER_C_POLL_INTERVAL_SECONDS
      );

      await this.redis.incr(REDIS_KEY_ACTIVE_RULE_COUNT);

      await prisma.monitoredAccount.upsert({
        where: { twitterHandle },
        create: {
          twitterHandle,
          launchRecordId,
          webhookRuleId: rule.id,
          active: true,
          queued: false,
          activatedAt: new Date(),
        },
        update: {
          webhookRuleId: rule.id,
          active: true,
          queued: false,
          activatedAt: new Date(),
          launchRecordId,
        },
      });

      log.info('Registered Tier C monitor', { twitterHandle, ruleId: rule.id });
    } catch (err) {
      log.error('Failed to register Tier C rule', { twitterHandle, err });
      throw err;
    }
  }

  /**
   * Deactivate monitoring rules for accounts that have been silent beyond TTL.
   * Called daily by the cron job.
   */
  async expireStale(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config.ACCOUNT_MONITOR_TTL_DAYS);

    const staleAccounts = await prisma.monitoredAccount.findMany({
      where: {
        active: true,
        lastTweetAt: { lt: cutoff },
      },
    });

    log.info('Expiring stale monitored accounts', { count: staleAccounts.length });

    for (const account of staleAccounts) {
      try {
        if (account.webhookRuleId) {
          await twitterApi.deleteRule(account.webhookRuleId);
          await this.redis.decr(REDIS_KEY_ACTIVE_RULE_COUNT);
        }

        await prisma.monitoredAccount.update({
          where: { id: account.id },
          data: { active: false, webhookRuleId: null },
        });

        log.info('Expired monitor', { twitterHandle: account.twitterHandle });

        // Activate next queued account if available
        await this.onRuleFreed();
      } catch (err) {
        log.error('Failed to expire account', { twitterHandle: account.twitterHandle, err });
      }
    }
  }

  /**
   * Activate the next queued account monitor when a rule slot becomes available.
   */
  async onRuleFreed(): Promise<void> {
    const hasCapacity = await this.hasRuleCapacity();
    if (!hasCapacity) return;

    const nextQueued = await prisma.monitoredAccount.findFirst({
      where: { queued: true, active: false },
      orderBy: { createdAt: 'asc' },
    });

    if (!nextQueued) return;

    try {
      const filter = `from:${nextQueued.twitterHandle} -is:retweet`;
      const rule = await twitterApi.createRule(
        `account_${nextQueued.twitterHandle}`,
        filter,
        config.TIER_C_POLL_INTERVAL_SECONDS
      );

      await this.redis.incr(REDIS_KEY_ACTIVE_RULE_COUNT);

      await prisma.monitoredAccount.update({
        where: { id: nextQueued.id },
        data: {
          webhookRuleId: rule.id,
          active: true,
          queued: false,
          activatedAt: new Date(),
        },
      });

      log.info('Activated queued monitor', { twitterHandle: nextQueued.twitterHandle });
    } catch (err) {
      log.error('Failed to activate queued account', { twitterHandle: nextQueued.twitterHandle, err });
    }
  }

  private async hasRuleCapacity(): Promise<boolean> {
    const [activeStr, maxStr] = await Promise.all([
      this.redis.get(REDIS_KEY_ACTIVE_RULE_COUNT),
      this.redis.get(REDIS_KEY_MAX_RULES),
    ]);

    const activeCount = parseInt(activeStr ?? '0', 10);
    const maxRules = parseInt(maxStr ?? '50', 10);

    return activeCount < maxRules - RULE_SLOT_BUFFER;
  }
}
