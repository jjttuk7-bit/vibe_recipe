// /api/recipe — BUILD 엔진 호출 (ENGINE.md §1~§5).
//
// P0 강제 (ROADMAP §8.5):
// - rate limit + env 가드는 본 사이클에서도 유지.
// - 헌법 §8.5: API 키 서버 격리. lib/env.ts(server-only) 만 통해 접근.
//
// P1 본문 구현:
// - **§1.4 / D-008 SSOT**: 모든 스키마는 @/lib/schema 한 곳에서만 import.
//   라우트 옆 z.object / z.enum 정의 0건 (RequestBodySchema 는 클라 입력 검증
//   전용으로 데이터 모델 SSOT 가 아니므로 유지 — R5/R9 가드 통과).
// - **D-001**: LLM 응답은 new_state 부분객체. diff 계산은 클라/서버 코드 책임
//   (lib/diff.ts splitDiff). 본 라우트는 splitDiff 를 호출하지 않는다 —
//   task description: "splitDiff 는 클라가 계산하므로 여기선 new_state 만".
// - **D-004 / R12**: EngineResponseSchema 검증 실패 시 에러 메시지를 user
//   메시지로 덧붙여 정확히 1회 재호출. extractJson 실패도 검증 실패로 카운트.
//   2회 연속 실패 → 502.
// - **§4 / D-008 cold_start**: buildContext 를 lib/buildContext.fetchBuildContext
//   로 조회 후 buildSystemPrompt 에 주입. cold_start=true 면 systemPrompt 가
//   "맹탕 모드"임을 명시 (lib/prompt.ts renderModeHeader 강제).
// - **GA-3**: BuildContext 조회 실패는 1회 재시도 후 502 (사용자 결정문 GA-3).
// - **R13**: messages.slice(-8) — RequestBodySchema 가 max(8) 이지만 한 번 더.
// - **인증**: Authorization: Bearer <jwt> 헤더에서 anon 토큰 추출.
//   supabase auth.getUser 로 user_id 검증 후 service-role 호출(R4 가드).
//   토큰 부재/검증 실패 → 401.
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import {
  BuildContextSchema,
  EngineResponseSchema,
  RecipeStateSchema,
  StageSchema,
  type BuildContext,
  type EngineResponse,
} from "@/lib/schema";
import { enforceRateLimit, withRateLimitHeaders } from "@/lib/ratelimit";
import { anthropicApiKey, vibeRecipeModel } from "@/lib/env";
import { buildSystemPrompt } from "@/lib/prompt";
import { fetchBuildContext } from "@/lib/buildContext";
import { authenticateRequest } from "@/lib/auth";

export const runtime = "nodejs";

// 클라이언트 요청 계약. messages 는 max(8) — ENGINE.md §3 "최근 8턴 대화".
// build_context 는 클라가 보내지 않는다 (서버가 DB 에서 조회). R5/R9 가드:
// 본 스키마는 클라 입력 검증 전용 — 데이터 모델 SSOT 가 아니다.
const RequestBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(8),
  recipe_id: z.string().uuid().nullable(),
  current_state: RecipeStateSchema.nullable(),
  stage: StageSchema,
});
type RequestBody = z.infer<typeof RequestBodySchema>;

// LLM 호출 max_tokens. taste/steps 단계의 JSON 부피 고려해 2000.
const MAX_TOKENS = 2000;

export async function POST(request: Request): Promise<Response> {
  // [1] P0 — Rate limit.
  const gate = await enforceRateLimit(request, "recipe");
  if (!gate.ok) return gate.response;

  // [2] P0 — Server-only env 접근. 실제 호출(아래)에서 부재 시 throw.

  // [3] 요청 검증.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return withRateLimitHeaders(
      jsonResponse(400, { error: "invalid_json" }),
      gate,
    );
  }
  const parsed = RequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return withRateLimitHeaders(
      jsonResponse(400, {
        error: "invalid_request",
        message: "요청 형식이 올바르지 않습니다.",
        details: parsed.error.flatten(),
      }),
      gate,
    );
  }
  const body = parsed.data;

  // [3a] 인증 — Authorization: Bearer <jwt>. R4(cross-tenant) 가드 진입점.
  // user_id 가 확정돼야 [4] 의 service-role 호출 가능.
  const authResult = await authenticateRequest(request);
  if (!authResult.ok) {
    return withRateLimitHeaders(authResult.response, gate);
  }
  const userId = authResult.userId;

  // [4] §4 / D-008 — BuildContext 조회. GA-3 정책: 1회 재시도 후 502.
  let buildContext: BuildContext;
  try {
    buildContext = await fetchBuildContext({
      recipeId: body.recipe_id,
      userId,
    });
  } catch {
    try {
      buildContext = await fetchBuildContext({
        recipeId: body.recipe_id,
        userId,
      });
    } catch {
      return withRateLimitHeaders(
        jsonResponse(502, {
          error: "build_context_fetch_failed",
          message: "지난 기록을 불러오지 못했어요. 다시 시도해주세요.",
        }),
        gate,
      );
    }
  }

  // [5] D-004 — Anthropic 호출 + 정확히 1회 재시도.
  try {
    const engineResponse = await callEngineWithRetry(body, buildContext);
    return withRateLimitHeaders(
      jsonResponse(200, {
        engineResponse,
        parsedAt: new Date().toISOString(),
      }),
      gate,
    );
  } catch (e) {
    // R12: extractJson 실패와 Zod 실패 모두 EngineValidationError 로 잡힘.
    // 그 외(네트워크 등)도 안전하게 502 로 노출 — 사용자가 다시 시도하게.
    const isValidation = e instanceof EngineValidationError;
    return withRateLimitHeaders(
      jsonResponse(502, {
        error: isValidation ? "engine_validation_failed" : "engine_call_failed",
        message: "엔진이 응답을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
      }),
      gate,
    );
  }
}

// ---------------------------------------------------------------------------
// D-004 / R12 — 정확히 1회 재시도
// ---------------------------------------------------------------------------

class EngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineValidationError";
  }
}

async function callEngineWithRetry(
  input: RequestBody,
  buildContext: BuildContext,
): Promise<EngineResponse> {
  // R13: RequestBodySchema 가 max(8) 이지만 한 번 더 슬라이스. 어떤 경로로든
  // 8개 초과가 들어와도 토큰 폭발 없음.
  const trimmedMessages = input.messages.slice(-8);

  // systemPrompt 는 결정적 — 1차/재시도 동일 컨텍스트 위에서 작동.
  const system = buildSystemPrompt({
    stage: input.stage,
    buildContext,
    recipeState: input.current_state,
  });

  // 1차 호출.
  const firstRaw = await callAnthropic(system, trimmedMessages);
  const firstParsed = tryParseEngineResponse(firstRaw);
  if (firstParsed.ok) return firstParsed.data;

  // 2차 호출 — D-004 "컴파일 에러 되던지기": 검증 에러를 user 메시지로 덧붙임.
  // extractJson 실패도 검증 실패로 카운트 (R12).
  const retryMessages: RequestBody["messages"] = [
    ...trimmedMessages,
    {
      role: "user",
      content: [
        "[시스템 검증 실패 — 다시 한 번 시도합니다]",
        "직전 응답이 요구된 JSON 계약을 만족하지 못했어요. 아래 오류를 보고 정확히 명세대로 JSON 만 다시 보내주세요.",
        firstParsed.error,
      ].join("\n"),
    },
  ];
  const secondRaw = await callAnthropic(system, retryMessages);
  const secondParsed = tryParseEngineResponse(secondRaw);
  if (secondParsed.ok) return secondParsed.data;

  // 정확히 1회 재시도 — 3회째는 금지 (D-004 / R12).
  throw new EngineValidationError(secondParsed.error);
}

let cachedAnthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic;
  cachedAnthropic = new Anthropic({ apiKey: anthropicApiKey() });
  return cachedAnthropic;
}

async function callAnthropic(
  system: string,
  messages: RequestBody["messages"],
): Promise<string> {
  const client = getAnthropic();
  const resp = await client.messages.create({
    model: vibeRecipeModel(),
    max_tokens: MAX_TOKENS,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  // text 블록만 이어붙임. tool_use 등 다른 타입은 본 라우트에서 사용 안 함.
  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  return text;
}

// JSON 추출 + EngineResponseSchema 검증을 한 번에. 어느 단계에서 실패해도
// { ok: false, error } 로 묶어 D-004 재시도 루프에 보낸다 (R12).
type ParseOk = { ok: true; data: EngineResponse };
type ParseFail = { ok: false; error: string };

function tryParseEngineResponse(raw: string): ParseOk | ParseFail {
  const json = extractJson(raw);
  if (json === null) {
    return {
      ok: false,
      error:
        "JSON 객체를 찾지 못했습니다. 응답 전체를 단일 JSON 객체로만 반환하세요 (코드블록 펜스/설명 텍스트 금지).",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      error: `JSON 파싱 실패: ${(e as Error).message}`,
    };
  }
  const validated = EngineResponseSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      error: `EngineResponse 스키마 검증 실패: ${validated.error.message}`,
    };
  }
  return { ok: true, data: validated.data };
}

// 첫 '{' ~ 마지막 '}' 슬라이스. 코드블록 펜스(``` ```)가 섞여 와도 통과 가능.
// 깊이 있는 다중 객체가 섞이면 JSON.parse 가 잡고 재시도 루프로.
// R12 가드: 본 함수는 절대 throw 하지 않는다 — null 반환만. 무한 루프 가능성 0.
function extractJson(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// 응답 헬퍼
// ---------------------------------------------------------------------------

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// SSOT 결합 보존 — BuildContextSchema / StageSchema 가 본 라우트의 단일 출처임을
// 컴파일러가 강제. (RequestBodySchema 에서 StageSchema 가 실 사용되고,
// BuildContextSchema 는 fetchBuildContext 내부 검증으로 간접 사용되지만,
// 본 파일이 import 한 사실을 명시적으로 보존한다.)
void BuildContextSchema;
