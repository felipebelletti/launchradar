import { useMemo } from 'react';
import { useAuth } from './useAuth';
import type { Plan } from '../types';

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  scout: 1,
  alpha: 2,
  pro: 3,
};

const WATCHLIST_LIMIT: Record<Plan, number> = {
  free: 5,
  scout: 25,
  alpha: 100,
  pro: Infinity,
};

export function usePlan() {
  const { user } = useAuth();

  const effectivePlan = useMemo((): Plan => {
    if (!user) return 'free';

    // Trial active?
    if (user.trialExpiresAt && new Date(user.trialExpiresAt) > new Date()) {
      return 'alpha';
    }

    return user.plan ?? 'free';
  }, [user]);

  const has = (required: Plan) =>
    PLAN_RANK[effectivePlan] >= PLAN_RANK[required];

  const isTrialing = useMemo(
    () => !!user?.trialExpiresAt && new Date(user.trialExpiresAt) > new Date(),
    [user],
  );

  const trialHoursRemaining = useMemo(() => {
    if (!user?.trialExpiresAt) return null;
    const ms = new Date(user.trialExpiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
  }, [user]);

  const watchlistLimit = WATCHLIST_LIMIT[effectivePlan];

  return {
    plan: effectivePlan,
    has,
    isTrialing,
    trialHoursRemaining,
    watchlistLimit,
  };
}

export { PLAN_RANK, WATCHLIST_LIMIT };
