// /api/run — CookRun 저장 + 용접 갱신 (DATA_MODEL.md §2~§4).
//
// P0 강제: rate limit 통과 + env 의존 import 까지 placeholder.
//
// **D-008 용접 강제 지점 (이 라우트의 존재 이유):**
//
//   CookRun 저장
//        │
//        ├──> RuntimeLog 갱신 (lib/runtime.ts: rebuildRuntimeLog)
//        │           │
//        │           └──> Fingerprint 재계산 (lib/fingerprint.ts: recomputeFingerprint)
//        │
//        └──> 한 트랜잭션 안에서 위 두 단계가 함께 일어나야 한다.
//
// 호출 순서를 끊으면 §4 용접 깨짐 — BUILD 가 cold start 로만 동작하는 회귀.
// 따라서 P1 구현은 supabase RPC 또는 Postgres 함수로 묶어 원자성을 보장한다.
//
// 헌법 §4 강제:
// - completed=true 인 CookRun 은 outcome ∈ {good, meh, failed} 가 반드시 있어야 한다.
//   (POSTMORTEM 없이 COOK 종료 불가.) → P1 에서 refine 으로 강제.
// - 핫픽스는 step_events[type="hotfix"] 로만 저장. RecipeState 미수정 (D-006).
//
// 현재는 P0 셸 — 501 응답 + rate limit 만 작동.
import { CookRunSchema } from "@/lib/schema";
import { enforceRateLimit, withRateLimitHeaders } from "@/lib/ratelimit";
import {
  supabaseServerServiceRoleClient,
  supabaseServerAnonClient,
} from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  // [1] P0 — Rate limit. /api/recipe 와 별도 prefix.
  const gate = await enforceRateLimit(request, "run");
  if (!gate.ok) return gate.response;

  // [2] P0 — server-only Supabase import 가드. 키 부재 시 명시적 에러.
  void supabaseServerServiceRoleClient;
  void supabaseServerAnonClient;

  // [3] 요청 본문 placeholder. P1 에서 CookRunSchema 로 검증.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withRateLimitHeaders(
      jsonResponse(400, { error: "invalid_json" }),
      gate,
    );
  }
  void CookRunSchema; // P1 에서 CookRunSchema.safeParse(body) 후 분기.
  void body;

  // [4] D-008 용접 호출 골격 (P1):
  //
  //   const parsed = CookRunSchema.safeParse(body);
  //   if (!parsed.success) return 400;
  //   const run = parsed.data;
  //
  //   // 트랜잭션 (Postgres RPC 권장):
  //   //   1) cook_runs INSERT
  //   //   2) runtime_logs UPSERT  ← rebuildRuntimeLog(recipe_id, [...runs, run])
  //   //   3) fingerprints UPSERT  ← recomputeFingerprint(user_id, [...logs])
  //   // 한 트랜잭션 안에서 셋 다 성공해야 한다. 하나라도 실패하면 전체 롤백.
  //   //
  //   // 호출 누락 = §4 용접 깨짐 = welding-inspector BLOCK.
  //
  return withRateLimitHeaders(
    jsonResponse(501, {
      error: "not_implemented",
      message:
        "/api/run 은 P0 셸 단계입니다. CookRun 저장 + RuntimeLog/Fingerprint 갱신은 P1 에서 활성화됩니다.",
    }),
    gate,
  );
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
