import type { User, Subscription, Plan } from '@prisma/client';

type UserWithSub = User & { subscription?: Subscription | null };

const PLAN_RANK: Record<Plan, number> = {
  FREE: 0,
  SCOUT: 1,
  ALPHA: 2,
  PRO: 3,
};

export function getEffectivePlan(user: UserWithSub): Plan {
  // Active trial overrides base plan
  if (
    user.trialExpiresAt &&
    user.trialExpiresAt > new Date() &&
    user.trialPlan
  ) {
    return user.trialPlan;
  }

  // Subscription cancelled or past_due → downgrade to FREE
  if (
    user.subscription?.status === 'PAST_DUE' ||
    user.subscription?.status === 'CANCELLED'
  ) {
    return 'FREE';
  }

  return user.plan;
}

export function hasPlan(user: UserWithSub, required: Plan): boolean {
  return PLAN_RANK[getEffectivePlan(user)] >= PLAN_RANK[required];
}

export const WATCHLIST_LIMIT: Record<Plan, number> = {
  FREE: 5,
  SCOUT: 25,
  ALPHA: 100,
  PRO: Infinity,
};

export function getWatchlistLimit(user: UserWithSub): number {
  return WATCHLIST_LIMIT[getEffectivePlan(user)];
}

export { PLAN_RANK };
