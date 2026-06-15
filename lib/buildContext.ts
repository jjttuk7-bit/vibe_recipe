// BuildContext 조회 헬퍼.
//
// 용접 구조 — §4 / D-008 의 코드 강제 지점:
//   BUILD 가 시작될 때 RuntimeLog 와 Fingerprint 를 반드시 조회한다.
//   둘 다 없으면 cold_start=true 로 채워서 systemPrompt 가 "맹탕 모드"임을
//   명시하게 한다. 본 함수가 그 조회의 단일 진입점이다.
//
// SSOT 의존:
//   - BuildContextSchema / RuntimeLogSchema / FingerprintSchema 는 @/lib/schema
//     에서만 import. 본 파일은 z.object 호출 0 (R5/R9 가드).
//
// GA-3 (BuildContext 조회 실패 정책):
//   - 본 함수는 throw 한다. 라우트가 1회 재시도 후 502 응답 패턴을 결정.
//   - 데이터 없음(첫 사용자)은 정상 경로 — 빈 traits/known_issues 로 채우고
//     cold_start=true 로 반환한다. 502 가 아니다.
//
// 인증:
//   - service-role 키로 RLS 우회. 호출자(라우트)가 user_id 검증을 끝낸 뒤에만
//     호출해야 한다. 검증 전에 호출하면 cross-tenant 누수 위험 (R4).
import "server-only";
import {
  BuildContextSchema,
  type BuildContext,
  type Fingerprint,
  type KnownIssue,
  type RuntimeLog,
} from "@/lib/schema";
import { supabaseServerServiceRoleClient } from "@/lib/supabase";

export type FetchBuildContextArgs = {
  // recipeId 가 null 이면 첫 빌드 직전(아직 recipe row 가 없음) → runtime_log=null.
  recipeId: string | null;
  // userId 는 라우트가 anon 토큰 검증 후 추출한 값. RLS 우회를 위한 service-role
  // 호출 직전 단계.
  userId: string;
};

// 라우트에서 호출.
//
//   try {
//     ctx = await fetchBuildContext({ recipeId, userId });
//   } catch (e1) {
//     try { ctx = await fetchBuildContext({ recipeId, userId }); } // GA-3 1회 재시도
//     catch (e2) { return 502; }
//   }
export async function fetchBuildContext(
  args: FetchBuildContextArgs,
): Promise<BuildContext> {
  const { recipeId, userId } = args;
  const supabase = supabaseServerServiceRoleClient();

  // 두 조회를 병렬로. 어느 한쪽이 throw 하면 라우트의 GA-3 재시도 루프로.
  const [runtimeLogRes, fingerprintRes] = await Promise.all([
    recipeId === null
      ? Promise.resolve({ data: null, error: null } as const)
      : supabase
          .from("runtime_logs")
          .select("recipe_id, user_id, total_runs, known_issues")
          .eq("recipe_id", recipeId)
          .eq("user_id", userId) // RLS 우회이므로 user_id 매칭을 코드로 강제 (R4)
          .maybeSingle(),
    supabase
      .from("fingerprints")
      .select("user_id, total_runs_all_recipes, traits")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (runtimeLogRes.error) {
    throw new Error(
      `[buildContext] runtime_logs 조회 실패: ${runtimeLogRes.error.message}`,
    );
  }
  if (fingerprintRes.error) {
    throw new Error(
      `[buildContext] fingerprints 조회 실패: ${fingerprintRes.error.message}`,
    );
  }

  const runtimeLogRaw = runtimeLogRes.data;
  const fingerprintRaw = fingerprintRes.data;

  // jsonb 컬럼은 unknown — 라우트가 사용하기 전에 한 곳에서 안전화한다.
  const runtimeLog: RuntimeLog | null =
    runtimeLogRaw === null
      ? null
      : {
          recipe_id: runtimeLogRaw.recipe_id as string,
          total_runs: runtimeLogRaw.total_runs as number,
          known_issues: normalizeKnownIssues(runtimeLogRaw.known_issues),
        };

  const fingerprint: Fingerprint | null =
    fingerprintRaw === null
      ? null
      : {
          user_id: fingerprintRaw.user_id as string,
          total_runs_all_recipes: fingerprintRaw.total_runs_all_recipes as number,
          // traits 는 jsonb. 본 단계에서는 그대로 통과시키되 BuildContextSchema 가
          // 최종 검증한다 (Trait 필드/타입 위반 시 ZodError → 라우트가 잡음).
          traits: (fingerprintRaw.traits as Fingerprint["traits"]) ?? [],
        };

  // cold_start 판정: 둘 다 부재면 true. RuntimeLog 가 있어도 known_issues 가
  // 비고 Fingerprint 가 부재면 학습된 신호가 없는 셈이지만, 헌법 §4 의
  // "둘 다 비어 있으면" 정의를 따른다 — 빈 RuntimeLog 행 자체도 "기록되기
  // 시작했음" 의 신호로 본다.
  const coldStart = runtimeLog === null && fingerprint === null;

  // 마지막 검증: BuildContextSchema 가 SSOT. 위에서 만든 객체가 스키마와
  // 어긋나면 ZodError 로 throw → 라우트의 GA-3 재시도 루프.
  return BuildContextSchema.parse({
    runtime_log: runtimeLog,
    fingerprint: fingerprint,
    cold_start: coldStart,
  });
}

// jsonb known_issues 를 KnownIssue[] 로 정규화. 최신순 정렬은 본 함수가 책임지지
// 않는다 — KnownIssueSchema 에 timestamp 가 없으므로 정렬 키가 없다. 향후 컬럼
// 추가 시(예: created_at) 이 위치에 정렬 도입. trimKnownIssues(lib/prompt.ts) 가
// 미해결 우선 정렬은 처리한다.
function normalizeKnownIssues(raw: unknown): KnownIssue[] {
  if (!Array.isArray(raw)) return [];
  // 라우트는 BuildContextSchema.parse 로 최종 검증하므로 본 정규화는 형태만 맞춤.
  return raw as KnownIssue[];
}
