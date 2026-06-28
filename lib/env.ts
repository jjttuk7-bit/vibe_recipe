// 서버 전용 환경 변수 헬퍼.
//
// 헌법 강제 (ADR D-011):
// - 이 파일은 server-only 패키지를 import하므로 "use client" 컴포넌트나
//   클라이언트 번들 import 그래프에 한 줄이라도 들어오면 Next.js가
//   빌드 타임에 에러를 던진다. ANTHROPIC_API_KEY / SUPABASE_SERVICE_ROLE_KEY /
//   UPSTASH_REDIS_REST_TOKEN 같은 키가 클라이언트 번들로 새는 사고를
//   import 차원에서 차단하는 것이 목적이다.
// - 부재 변수에 대해 절대 조용한 fallback을 하지 않는다. 빈 값이거나 누락
//   상태에서 호출되면 명시적 에러를 던져 배포 전 발견되도록 한다.
//
// 참고: 클라이언트에 안전하게 노출 가능한 값(예: Supabase URL, anon key)이
// 필요해지면 NEXT_PUBLIC_* 접두사로 별도 노출 — 절대 이 파일을 통하지 않는다.
import "server-only";

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    throw new Error(
      `[env] ${name} 환경 변수가 설정되어 있지 않습니다. .env.local 또는 배포 환경 변수에 값을 채워주세요.`,
    );
  }
  return raw;
}

function optionalEnv(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

function optionalIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error(`[env] ${name} 은 양의 정수여야 합니다. 받은 값: ${raw}`);
  }
  return n;
}

// --- OpenAI (엔진) ---
// 데모 모드(2026-06-28): 엔진을 OpenAI 로 교체. OPENAI_API_KEY 사용.
export function openaiApiKey(): string {
  return requireEnv("OPENAI_API_KEY");
}

// 기본 gpt-4o-mini, 환경변수 VIBE_RECIPE_MODEL 로 교체 가능.
export function vibeRecipeModel(): string {
  return optionalEnv("VIBE_RECIPE_MODEL", "gpt-4o-mini");
}

// --- Upstash (Rate Limit, P0 필수) ---
export function upstashRedisRestUrl(): string {
  return requireEnv("UPSTASH_REDIS_REST_URL");
}

export function upstashRedisRestToken(): string {
  return requireEnv("UPSTASH_REDIS_REST_TOKEN");
}

// --- Supabase (영속, D-007 필수) ---
export function supabaseUrl(): string {
  return requireEnv("SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return requireEnv("SUPABASE_ANON_KEY");
}

// service-role 은 RLS 우회용. 서버 라우트 안에서만, 그것도 사용자 신원이
// 검증된 직후에만 사용한다.
export function supabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

// --- Rate Limit 파라미터 ---
export function rateLimitPerMinute(): number {
  return optionalIntEnv("RATE_LIMIT_PER_MINUTE", 60);
}
