// /api/* 공통 rate limit 헬퍼 (P0 필수, ROADMAP §8.5).
//
// 헌법 강제:
// - IP 기반 sliding window. Upstash Redis 백엔드.
// - UPSTASH_* 변수 부재 시 lib/env.ts 가 명시적 에러를 던지므로 조용한
//   bypass는 발생할 수 없다.
// - 신뢰 가드: x-forwarded-for 의 첫 토큰만 사용. 헤더가 누락된 경우
//   "anonymous" 단일 키로 전체 트래픽이 몰리지 않도록 라우트별 prefix를
//   섞어 분리한다 (Ratelimit prefix).
// - 429 응답은 Retry-After / X-RateLimit-* 헤더를 동봉한다.
import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import {
  rateLimitPerMinute,
  upstashRedisRestToken,
  upstashRedisRestUrl,
} from "./env";

let cachedRedis: Redis | null = null;
function getRedis(): Redis {
  if (cachedRedis) return cachedRedis;
  cachedRedis = new Redis({
    url: upstashRedisRestUrl(),
    token: upstashRedisRestToken(),
  });
  return cachedRedis;
}

const limiterCache = new Map<string, Ratelimit>();
function getLimiter(prefix: string): Ratelimit {
  const cached = limiterCache.get(prefix);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(rateLimitPerMinute(), "60 s"),
    analytics: false,
    prefix,
  });
  limiterCache.set(prefix, limiter);
  return limiter;
}

// 신뢰 가드: 첫 토큰만 사용. 프록시 체인의 뒷쪽 IP를 신뢰하지 않는다.
// 헤더 부재 시 호출자가 라우트별 prefix를 다르게 줘서 anonymous 트래픽이
// 한 키로 뭉치지 않게 한다.
function identifyClient(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) {
    const trimmed = real.trim();
    if (trimmed) return trimmed;
  }
  return "anonymous";
}

export type RateLimitOk = {
  ok: true;
  limit: number;
  remaining: number;
  reset: number;
};

export type RateLimitBlocked = {
  ok: false;
  response: Response;
};

export type RateLimitResult = RateLimitOk | RateLimitBlocked;

// 라우트 핸들러에서 호출.
//   const gate = await enforceRateLimit(request, "recipe");
//   if (!gate.ok) return gate.response;
// 데모 모드(2026-06-28): Upstash 미설정이면 rate limit 을 건너뛴다.
// OPENAI_API_KEY 만으로 동작하게 하기 위함. 운영 전환 시 UPSTASH_* 를 채우면
// 자동으로 다시 활성화된다. (공개 URL 비용 노출 주의 — README 경고 참고.)
function upstashConfigured(): boolean {
  return (
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export async function enforceRateLimit(
  request: Request,
  routeKey: string,
): Promise<RateLimitResult> {
  if (!upstashConfigured()) {
    // 무제한 통과 — 헤더용 더미 값.
    return { ok: true, limit: 0, remaining: 0, reset: Date.now() };
  }
  const id = identifyClient(request);
  const limiter = getLimiter(`viberecipe:${routeKey}`);
  const { success, limit, remaining, reset } = await limiter.limit(id);

  if (!success) {
    const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
          retry_after_sec: retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
          },
        },
      ),
    };
  }

  return { ok: true, limit, remaining, reset };
}

// 통과 응답에 헤더를 얹고 싶을 때 헬퍼.
export function withRateLimitHeaders(
  response: Response,
  gate: RateLimitOk,
): Response {
  response.headers.set("X-RateLimit-Limit", String(gate.limit));
  response.headers.set("X-RateLimit-Remaining", String(gate.remaining));
  response.headers.set("X-RateLimit-Reset", String(gate.reset));
  return response;
}
