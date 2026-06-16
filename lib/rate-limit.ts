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

// Sales-specific rate limiter (30 requests per 5 minutes)
let salesRatelimit: Ratelimit | null = null;
if (hasUpstash) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  salesRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "300 s"),
    analytics: true,
  });
}

const salesDevCache = new Map<string, { count: number; resetAt: number }>();
const SALES_LIMIT = 30;
const SALES_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export async function checkSalesRateLimit(
  identifier: string
): Promise<{ success: boolean; remaining: number }> {
  if (salesRatelimit) {
    const result = await salesRatelimit.limit(`sales:${identifier}`);
    return {
      success: result.success,
      remaining: result.remaining,
    };
  }

  const now = Date.now();
  const cached = salesDevCache.get(identifier);

  if (!cached || now >= cached.resetAt) {
    const resetAt = now + SALES_WINDOW_MS;
    salesDevCache.set(identifier, { count: 1, resetAt });
    return { success: true, remaining: SALES_LIMIT - 1 };
  }

  if (cached.count >= SALES_LIMIT) {
    return { success: false, remaining: 0 };
  }

  cached.count += 1;
  salesDevCache.set(identifier, cached);
  return { success: true, remaining: SALES_LIMIT - cached.count };
}

