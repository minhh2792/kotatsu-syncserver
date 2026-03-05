interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimiterConfig {
  limit: number;
  windowMs: number;
}

export class RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();

  constructor(private readonly config: RateLimiterConfig) {}

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.config.windowMs });
      return true;
    }

    if (entry.count >= this.config.limit) {
      return false;
    }

    entry.count += 1;
    return true;
  }
}

export const globalApiLimiter = new RateLimiter({ limit: 100, windowMs: 60_000 });
export const authLimiter = new RateLimiter({ limit: 5, windowMs: 60_000 });
export const forgotPasswordLimiter = new RateLimiter({ limit: 5, windowMs: 600_000 });
export const resetPasswordLimiter = new RateLimiter({ limit: 5, windowMs: 600_000 });
