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
import {
  CookRunSchema,
  RuntimeLogSchema,
  type CookRun,
  type RuntimeLog,
} from "@/lib/schema";
import { enforceRateLimit, withRateLimitHeaders } from "@/lib/ratelimit";
import {
  supabaseServerServiceRoleClient,
  supabaseServerUserClient,
} from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { rebuildRuntimeLog } from "@/lib/runtime";
import { recomputeFingerprint } from "@/lib/fingerprint";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  // [1] P0 — Rate limit. /api/recipe 와 별도 prefix.
  const gate = await enforceRateLimit(request, "run");
  if (!gate.ok) return gate.response;

  // [2] 인증 — /api/recipe 와 같은 D-015 경계 정책.
  const authResult = await authenticateRequest(request);
  if (!authResult.ok) {
    return withRateLimitHeaders(authResult.response, gate);
  }

  // [3] 요청 본문 검증.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withRateLimitHeaders(
      jsonResponse(400, { error: "invalid_json" }),
      gate,
    );
  }

  const parsed = CookRunSchema.safeParse(body);
  if (!parsed.success) {
    return withRateLimitHeaders(
      jsonResponse(400, {
        error: "invalid_cook_run",
        message: "조리 결과 형식이 올바르지 않습니다.",
        details: parsed.error.flatten(),
      }),
      gate,
    );
  }

  const run = parsed.data;
  if (run.user_id !== authResult.userId) {
    return withRateLimitHeaders(
      jsonResponse(403, {
        error: "forbidden_user_mismatch",
        message: "다른 사용자의 조리 기록은 저장할 수 없습니다.",
      }),
      gate,
    );
  }

  try {
    const service = supabaseServerServiceRoleClient();
    const [existingRuns, existingLogs] = await Promise.all([
      fetchExistingRuns(service, run),
      fetchExistingRuntimeLogs(service, run.user_id),
    ]);

    const runtimeLog = rebuildRuntimeLog(run.recipe_id, [
      ...existingRuns.filter((existing) => existing.id !== run.id),
      run,
    ]);
    const fingerprint = recomputeFingerprint(
      run.user_id,
      mergeRuntimeLogs(existingLogs, runtimeLog),
    );

    const userClient = supabaseServerUserClient(authResult.token);
    const { error } = await userClient.rpc("save_cook_run", {
      p_cook_run: run,
      p_runtime_log: runtimeLog,
      p_fingerprint: fingerprint,
    });

    if (error) {
      return withRateLimitHeaders(
        jsonResponse(502, {
          error: "save_cook_run_failed",
          message: "조리 결과를 저장하지 못했어요. 다시 시도해주세요.",
        }),
        gate,
      );
    }

    return withRateLimitHeaders(
      jsonResponse(200, {
        cookRun: run,
        runtimeLog,
        fingerprint,
        savedAt: new Date().toISOString(),
      }),
      gate,
    );
  } catch {
    return withRateLimitHeaders(
      jsonResponse(502, {
        error: "run_commit_failed",
        message: "조리 기록을 학습 루프로 반영하지 못했어요.",
      }),
      gate,
    );
  }
}

type SupabaseLike = ReturnType<typeof supabaseServerServiceRoleClient>;

async function fetchExistingRuns(
  supabase: SupabaseLike,
  run: CookRun,
): Promise<CookRun[]> {
  const { data, error } = await supabase
    .from("cook_runs")
    .select("id, recipe_id, user_id, started_at, completed, outcome, step_events")
    .eq("recipe_id", run.recipe_id)
    .eq("user_id", run.user_id)
    .order("started_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => CookRunSchema.parse(row));
}

async function fetchExistingRuntimeLogs(
  supabase: SupabaseLike,
  userId: string,
): Promise<RuntimeLog[]> {
  const { data, error } = await supabase
    .from("runtime_logs")
    .select("recipe_id, total_runs, known_issues")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => RuntimeLogSchema.parse(row));
}

function mergeRuntimeLogs(
  existingLogs: readonly RuntimeLog[],
  nextLog: RuntimeLog,
): RuntimeLog[] {
  return [
    ...existingLogs.filter((log) => log.recipe_id !== nextLog.recipe_id),
    nextLog,
  ];
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
