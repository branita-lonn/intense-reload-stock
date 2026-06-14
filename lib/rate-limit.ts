// lib/rate-limit.ts
// Rate limiting implementation with Upstash Redis and in-memory fallback for local development

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Check if Upstash Redis variables are present
const hasUpstash = 
  !!process.env.UPSTASH_REDIS_REST_URL && 
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// Initialize Upstash Redis rate limiter if keys are present
let upstashRatelimit: Ratelimit | null = null;
if (hasUpstash) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  // sliding window: 5 requests per 60 seconds
  upstashRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "60 s"),
    analytics: true,
  });
}

// Dev fallback in-memory rate limiter
// DEV ONLY — not suitable for multi-instance production deployments; configure Upstash for production.
const devCache = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW_MS = 60 * 1000; // 60 seconds

/**
 * Checks if a given identifier is within rate limits (5 requests per 60 seconds)
 * @param identifier e.g., IP address or user email
 */
export async function checkRateLimit(
  identifier: string
): Promise<{ success: boolean; remaining: number }> {
  if (upstashRatelimit) {
    const result = await upstashRatelimit.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
    };
  }

  // Fallback in-memory rate limiting for development
  const now = Date.now();
  const cached = devCache.get(identifier);

  if (!cached || now >= cached.resetAt) {
    // New window
    const resetAt = now + WINDOW_MS;
    devCache.set(identifier, { count: 1, resetAt });
    return { success: true, remaining: LIMIT - 1 };
  }

  if (cached.count >= LIMIT) {
    // Limit exceeded
    return { success: false, remaining: 0 };
  }

  // Increment count
  cached.count += 1;
  devCache.set(identifier, cached);
  return { success: true, remaining: LIMIT - cached.count };
}
