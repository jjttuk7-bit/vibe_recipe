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
  EngineStructuredSchema,
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

  const encoder = new TextEncoder();
  const frame = (obj: StreamEvent): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitDelta = (text: string) =>
        controller.enqueue(frame({ type: "delta", text }));
      try {
        // 1차 시도 — 평문 실시간 스트리밍.
        let result = await runStreamingAttempt(system, baseMessages, emitDelta);

        // D-004 — 정확히 1회 재시도. 흘린 평문을 폐기(reset)하고 다시 스트리밍.
        if (!result.ok) {
          controller.enqueue(frame({ type: "reset" }));
          const retryMessages: RequestBody["messages"] = [
            ...baseMessages,
            { role: "user", content: retryUserMessage(result.error) },
          ];
          result = await runStreamingAttempt(system, retryMessages, emitDelta);
        }

        if (!result.ok) {
          // 정확히 1회 재시도 — 3회째 금지 (D-004 / R12).
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

        controller.enqueue(
          frame({
            type: "done",
            engineResponse: result.data,
            parsedAt: new Date().toISOString(),
            context_used: contextUsed,
          }),
        );
        controller.close();
      } catch {
        // 네트워크 등 — 안전하게 error 이벤트로 노출.
        controller.enqueue(
          frame({
            type: "error",
            error: "engine_call_failed",
            message: "엔진이 응답을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
          }),
        );
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
// D-029 — 2단계 스트리밍 + D-004 정확히 1회 재시도
// ---------------------------------------------------------------------------

// 평문(prose)과 구조 JSON 을 가르는 구분자. lib/prompt.ts 출력 명세와 1:1.
const STATE_DELIMITER = "===STATE_JSON===";

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

// 한 번의 LLM 스트리밍 시도. 평문은 emitDelta 로 실시간 방출하고, 구분자
// 뒤 구조 JSON 은 완결 수신 후 검증한다. 부분 delta 가 구분자를 흘리지 않도록
// 구분자 길이만큼 꼬리를 보류한다.
async function runStreamingAttempt(
  system: string,
  messages: RequestBody["messages"],
  emitDelta: (text: string) => void,
): Promise<ParseOk | ParseFail> {
  let full = "";
  let proseEmitted = 0;
  let delimIndex = -1;

  for await (const chunk of streamAnthropicText(system, messages)) {
    full += chunk;
    if (delimIndex === -1) delimIndex = full.indexOf(STATE_DELIMITER);
    // 구분자를 찾았으면 그 앞까지가 평문. 아직이면 구분자 길이만큼 보류.
    const proseEnd =
      delimIndex !== -1
        ? delimIndex
        : Math.max(0, full.length - STATE_DELIMITER.length);
    if (proseEnd > proseEmitted) {
      emitDelta(full.slice(proseEmitted, proseEnd));
      proseEmitted = proseEnd;
    }
  }

  if (delimIndex === -1) {
    return {
      ok: false,
      error: `구분자 ${STATE_DELIMITER} 를 찾지 못했습니다. 평문 메시지 다음 줄에 정확히 ${STATE_DELIMITER} 를 쓰고 구조 JSON 을 이어주세요.`,
    };
  }
  const prose = full.slice(0, delimIndex).trim();
  if (prose.length === 0) {
    return {
      ok: false,
      error: `평문 대화 메시지가 비어 있습니다. ${STATE_DELIMITER} 앞에 1~3문장의 대화 메시지를 쓰세요.`,
    };
  }
  const structuredRaw = full.slice(delimIndex + STATE_DELIMITER.length);
  return assembleEngineResponse(prose, structuredRaw);
}

// 흘린 평문(message) + 구분자 뒤 구조 JSON 을 합쳐 EngineResponse 로 검증.
// new_state 는 여기서 **완결된 1건**으로 safeParse — D-001/D-002 보존.
function assembleEngineResponse(
  prose: string,
  structuredRaw: string,
): ParseOk | ParseFail {
  const json = extractJson(structuredRaw);
  if (json === null) {
    return {
      ok: false,
      error: `${STATE_DELIMITER} 뒤에서 JSON 객체를 찾지 못했습니다. 구분자 뒤에는 단일 JSON 객체만 두세요 (펜스/설명 금지).`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `구조 JSON 파싱 실패: ${(e as Error).message}` };
  }
  // 구조 JSON 은 message 를 제외한 5개 키 (EngineStructuredSchema).
  const structured = EngineStructuredSchema.safeParse(parsed);
  if (!structured.success) {
    return {
      ok: false,
      error: `EngineStructured 스키마 검증 실패: ${structured.error.message}`,
    };
  }
  // 평문 message 를 합쳐 최종 EngineResponse 로 재검증 (belt + suspenders).
  const assembled = EngineResponseSchema.safeParse({
    message: prose,
    ...structured.data,
  });
  if (!assembled.success) {
    return {
      ok: false,
      error: `EngineResponse 조립 검증 실패: ${assembled.error.message}`,
    };
  }
  return { ok: true, data: assembled.data };
}

// D-004 "컴파일 에러 되던지기" — 검증 에러를 user 메시지로 덧붙여 1회 재시도.
function retryUserMessage(error: string): string {
  return [
    "[시스템 검증 실패 — 다시 한 번 시도합니다]",
    `직전 응답이 요구된 형식을 만족하지 못했어요. 아래 오류를 보고 정확히 명세대로 (먼저 평문 대화 메시지, 다음 줄에 ${STATE_DELIMITER}, 그 다음 구조 JSON) 다시 보내주세요.`,
    error,
  ].join("\n");
}

// Anthropic 스트리밍 — text_delta 만 yield. tool_use 등은 본 라우트 미사용.
async function* streamAnthropicText(
  system: string,
  messages: RequestBody["messages"],
): AsyncGenerator<string> {
  const client = getAnthropic();
  const stream = await client.messages.create({
    model: vibeRecipeModel(),
    max_tokens: MAX_TOKENS,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

let cachedAnthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic;
  cachedAnthropic = new Anthropic({ apiKey: anthropicApiKey() });
  return cachedAnthropic;
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
