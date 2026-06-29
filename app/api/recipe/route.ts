// /api/recipe — BUILD 엔진 호출 (데모 모드).
//
// 2026-06-28 데모 정리:
// - 엔진을 OpenAI 로 교체 (OPENAI_API_KEY). 모델 기본 gpt-4o-mini.
// - **인증/Supabase 제거**: 로그인 없이 누구나 BUILD 가능. user_id·BuildContext
//   조회 없이 항상 cold_start 로 시작 (회귀학습/지문 주입은 데모에서 비활성).
// - rate limit 은 Upstash 설정 시에만 (lib/ratelimit). 미설정이면 통과.
// - D-029 2단계 스트리밍 + D-004 1회 재시도 + D-001(검증 후 diff) 보존.
import { z } from "zod";
import OpenAI from "openai";
import {
  EngineResponseSchema,
  RecipeStateSchema,
  StageSchema,
  type BuildContext,
  type EngineResponse,
  type Stage,
} from "@/lib/schema";
import { enforceRateLimit, withRateLimitHeaders } from "@/lib/ratelimit";
import { openaiApiKey, vibeRecipeModel } from "@/lib/env";
import { buildSystemPrompt } from "@/lib/prompt";
import { enrichIngredientRoles } from "@/lib/formulas";

export const runtime = "nodejs";

// 데모: 학습 trait 없을 때의 cold_start. (로그인/Supabase 연결 시 fetchBuildContext 로 복원.)
const DEMO_BUILD_CONTEXT: BuildContext = {
  runtime_log: null,
  fingerprint: null,
  cold_start: true,
};
// 합성 fingerprint 용 데모 user_id (UuidSchema 형식 충족용 상수).
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000000";

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
  // 데모 로컬 학습 — 클라(localStorage)가 보내는 확정 trait 문구.
  client_traits: z.array(z.string().min(1).max(60)).max(10).optional(),
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

  // 데모 로컬 학습 — 클라가 보낸 trait 가 있으면 학습 모드 BuildContext 를 합성.
  // (로그인+DB 전환 시 fetchBuildContext 가 Supabase 에서 복원할 자리.)
  const clientTraits = body.client_traits ?? [];
  const buildContext: BuildContext =
    clientTraits.length > 0
      ? {
          runtime_log: null,
          cold_start: false,
          fingerprint: {
            user_id: DEMO_USER_ID,
            total_runs_all_recipes: 0,
            traits: clientTraits.map((label, i) => ({
              key: `local_${i}`,
              label,
              confidence: 0.9,
              evidence_run_ids: [],
            })),
          },
        }
      : DEMO_BUILD_CONTEXT;

  // [5] D-029 — 2단계 스트리밍. 평문 메시지는 토큰 단위 delta 로 흘리고,
  // 구조 JSON(new_state 포함)은 완결 수신 후 1건으로 검증(D-004 1회 재시도) →
  // done 이벤트로 원자 전송. D-001(검증 후 diff)·D-002 보존.
  //
  // SSE 프레임: `data: {json}\n\n`. json.type:
  //   - delta : { type, text }            평문 토큰
  //   - reset : { type }                  재시도 — 흘린 평문 폐기
  //   - done  : { type, engineResponse, parsedAt, context_used }
  //   - error : { type, error, message }  2회 실패/네트워크
  //
  // 주의: rate limit/auth/buildContext 실패는 [1]~[4] 에서 **스트림 시작 전**
  // 일반 JSON 4xx/5xx 로 반환된다. 스트림이 열린 뒤에는 200 + error 이벤트.

  // D-025: Context 투명성 — done 이벤트 wrapper에 BuildContext 요약 동봉.
  const contextUsed = {
    cold_start: buildContext.cold_start,
    known_issues_count: buildContext.runtime_log?.known_issues.length ?? 0,
    traits_applied:
      buildContext.fingerprint?.traits.map((t) => ({
        key: t.key,
        label: t.label,
        confidence: t.confidence,
      })) ?? [],
  };

  const system = buildSystemPrompt({
    stage: body.stage,
    buildContext,
    recipeState: body.current_state,
  });
  // R13: max(8) 이지만 한 번 더 슬라이스 — 어떤 경로로든 토큰 폭발 없음.
  const baseMessages = body.messages.slice(-8);
  // 단계별 토큰 캡 — concept/base 는 짧으니 작게(빠르게), steps 는 크게.
  const maxTokens = maxTokensForStage(body.stage);

  const encoder = new TextEncoder();
  const frame = (obj: StreamEvent): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitDelta = (text: string) =>
        controller.enqueue(frame({ type: "delta", text }));
      try {
        // JSON 모드 스트리밍 — message 토큰을 실시간으로 흘려 저지연.
        // 유효 JSON 은 JSON 모드가 보장, 최종 검증은 완성본으로(D-001). 스키마
        // 실패 시에만 재시도(최대 3회), 재시도 전 흘린 미리보기 폐기(reset).
        const MAX_ATTEMPTS = 3;
        let result: ParseOk | ParseFail = { ok: false, error: "init" };
        let attemptMessages: RequestBody["messages"] = baseMessages;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          if (attempt > 1) controller.enqueue(frame({ type: "reset" }));
          result = await callEngineStreaming(
            system,
            attemptMessages,
            maxTokens,
            emitDelta,
          );
          if (result.ok) break;
          attemptMessages = [
            ...baseMessages,
            { role: "user", content: retryUserMessage(result.error) },
          ];
        }

        if (!result.ok) {
          controller.enqueue(
            frame({
              type: "error",
              error: "engine_validation_failed",
              message: "엔진이 응답을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
            }),
          );
          controller.close();
          return;
        }

        // 결정적 role 보완 — 양념/향신 이름은 코드가 seasoning 으로(LLM 누락 보강).
        if (result.data.new_state?.ingredients) {
          result.data.new_state = {
            ...result.data.new_state,
            ingredients: enrichIngredientRoles(
              result.data.new_state.ingredients,
            ),
          };
        }
        // 스트리밍으로 이미 message 를 흘렸으므로 바로 done (최종 검증본 동봉).
        controller.enqueue(
          frame({
            type: "done",
            engineResponse: result.data,
            parsedAt: new Date().toISOString(),
            context_used: contextUsed,
          }),
        );
        controller.close();
      } catch (e) {
        // OpenAI 한도/결제/키 오류를 구체 메시지로 노출 ("1번 후 중단" 진단용).
        const { error, message } = openAiErrorMessage(e);
        console.error("[/api/recipe] engine error:", e);
        controller.enqueue(frame({ type: "error", error, message }));
        controller.close();
      }
    },
  });

  return withRateLimitHeaders(
    new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    }),
    gate,
  );
}

// ---------------------------------------------------------------------------
// 엔진 — OpenAI JSON 모드(단일 객체) + D-004 재시도 (2026-06-29)
// 2단계 스트리밍(===STATE_JSON===)은 gpt-4o-mini 형식 실패가 잦아 폐기.
// JSON 모드로 유효 JSON 을 보장받고, 타이핑 느낌은 서버가 message 를 청크로 흘려 유지.
// D-001(완결 1건 검증 후 diff)·D-002 보존.
// ---------------------------------------------------------------------------

// 클라로 흘려보내는 SSE 이벤트 합 (BuildMode.tsx 의 리더와 1:1).
type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "reset" }
  | {
      type: "done";
      engineResponse: EngineResponse;
      parsedAt: string;
      context_used: unknown;
    }
  | { type: "error"; error: string; message: string };

type ParseOk = { ok: true; data: EngineResponse };
type ParseFail = { ok: false; error: string };

// 한 번의 엔진 호출 — JSON 모드 + 스트리밍. message 값만 골라 실시간으로 흘리고
// (저지연), 완성된 전체 JSON 을 parseEngineResponse 로 최종 검증(D-001 완결 1건).
async function callEngineStreaming(
  system: string,
  messages: RequestBody["messages"],
  maxTokens: number,
  emitDelta: (text: string) => void,
): Promise<ParseOk | ParseFail> {
  const client = getOpenAI();
  const stream = await client.chat.completions.create({
    model: vibeRecipeModel(),
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    stream: true,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  const streamer = createMessageStreamer();
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    const out = streamer.push(delta);
    if (out) emitDelta(out);
  }
  return parseEngineResponse(streamer.full());
}

// 누적되는 JSON 에서 "message" 문자열 값만 점진 추출 → 타이핑 미리보기로 방출.
// 미리보기일 뿐이고 권위 있는 message 는 done 의 검증본이라, 추출이 살짝 어긋나도
// 최종 렌더는 깨끗하다(클라가 done 시 교체). 이스케이프(\", \\, \n) 처리.
function createMessageStreamer(): {
  push: (chunk: string) => string;
  full: () => string;
} {
  let buf = "";
  let cursor = -1; // -1: message 값 시작 전. 그 외: 다음에 읽을 절대 인덱스.
  let done = false;
  return {
    full: () => buf,
    push(chunk: string): string {
      buf += chunk;
      if (done) return "";
      if (cursor === -1) {
        const m = buf.match(/"message"\s*:\s*"/);
        if (!m || m.index === undefined) return "";
        cursor = m.index + m[0].length;
      }
      let out = "";
      while (cursor < buf.length) {
        const ch = buf.charAt(cursor);
        if (ch === "\\") {
          if (cursor + 1 >= buf.length) break; // 이스케이프 짝 대기
          const next = buf.charAt(cursor + 1);
          out +=
            next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "" : next;
          cursor += 2;
          continue;
        }
        if (ch === '"') {
          done = true;
          cursor += 1;
          break;
        }
        out += ch;
        cursor += 1;
      }
      return out;
    },
  };
}

// 단계별 출력 토큰 캡 — concept/base 짧게(빠르게), steps 는 JSON 부피 고려 크게.
function maxTokensForStage(stage: Stage): number {
  switch (stage) {
    case "concept":
    case "base":
      return 700;
    case "taste":
    case "done":
      return 1200;
    case "steps":
      return MAX_TOKENS;
    default: {
      const _exhaustive: never = stage;
      void _exhaustive;
      return MAX_TOKENS;
    }
  }
}

// JSON 추출 + EngineResponseSchema(message 포함 6키) 검증. D-001 보존(완결 1건).
function parseEngineResponse(raw: string): ParseOk | ParseFail {
  const json = extractJson(raw);
  if (json === null) {
    return {
      ok: false,
      error:
        "JSON 객체를 찾지 못했습니다. 6개 키(message/stage/new_state/options/change_log/warnings)를 가진 단일 JSON 객체로만 반환하세요.",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `JSON 파싱 실패: ${(e as Error).message}` };
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

// D-004 "컴파일 에러 되던지기" — 검증 에러를 user 메시지로 덧붙여 재시도.
function retryUserMessage(error: string): string {
  return [
    "[시스템 검증 실패 — 다시 한 번 시도합니다]",
    "직전 응답이 요구된 JSON 계약을 만족하지 못했어요. 아래 오류를 보고, 6개 키(message/stage/new_state/options/change_log/warnings)를 가진 정확한 단일 JSON 객체로만 다시 보내주세요.",
    error,
  ].join("\n");
}

let cachedOpenAI: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedOpenAI) return cachedOpenAI;
  // maxRetries 1 + 30s 타임아웃 — 한도(429) 오류 때 SDK 의 긴 백오프로
  // 멈춘 것처럼 보이는 현상("1번 후 중단") 방지. 빠르게 실패→원인 노출.
  cachedOpenAI = new OpenAI({
    apiKey: openaiApiKey(),
    maxRetries: 1,
    timeout: 30_000,
  });
  return cachedOpenAI;
}

// OpenAI 오류를 사용자에게 보일 구체 메시지로 분류. status/code 로 키·결제·한도 구분.
function openAiErrorMessage(e: unknown): { error: string; message: string } {
  const err = e as {
    status?: number;
    code?: string;
    error?: { code?: string };
  };
  const status = err?.status;
  const code = err?.code ?? err?.error?.code;
  if (status === 401 || code === "invalid_api_key") {
    return {
      error: "openai_auth",
      message:
        "OpenAI 키가 거부됐어요. Vercel 의 OPENAI_API_KEY 값이 맞는지 확인해주세요.",
    };
  }
  if (code === "insufficient_quota") {
    return {
      error: "openai_quota",
      message:
        "OpenAI 사용 한도/잔액이 소진됐어요. platform.openai.com 의 Billing(결제)을 확인해주세요.",
    };
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return {
      error: "openai_rate_limit",
      message: "OpenAI 요청 한도에 걸렸어요. 잠시 후 다시 시도해주세요.",
    };
  }
  return {
    error: "engine_call_failed",
    message: "엔진이 응답을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
  };
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
