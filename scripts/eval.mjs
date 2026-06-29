// scripts/eval.mjs — 셰프 품질 eval 하네스 (코딩 모델의 eval/벤치마크 방식 차용).
//
// 왜: 스샷 1번 테스트는 못 믿는다 — mini 는 확률적. 같은 입력을 N번 돌려
// "간장 안 넣나 / 게이지 검증 통과하나 / 재료 역할 다나"를 *점수*로 본다.
// iterate-test-fix 를 객관적으로. (RECIPE_ANATOMY/CHECKLIST §7)
//
// 실행: OPENAI_API_KEY=sk-... npm run eval   (EVAL_RUNS=5 로 횟수 조절)
// 키 없으면: 케이스·프롬프트 빌드만 검증하고 멈춤.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = resolve(".");
const require = createRequire(import.meta.url);

// @/ 별칭 + .ts 트랜스파일 (scripts/test.mjs 와 동일 로더).
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      join(root, request.slice(2)),
      parent,
      isMain,
      options,
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = (mod, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const { buildSystemPrompt } = require("@/lib/prompt");
const { EngineResponseSchema } = require("@/lib/schema");
const { enrichIngredientRoles } = require("@/lib/formulas");

const DEMO_CTX = { runtime_log: null, fingerprint: null, cold_start: true };
const RUNS = Number(process.env.EVAL_RUNS || 3);
const MODEL = process.env.VIBE_RECIPE_MODEL || "gpt-4o-mini";

// 재료 이름에 특정 문자열이 든 게 있나.
const hasIng = (res, kw) =>
  (res.new_state?.ingredients ?? []).some((i) => i.name.includes(kw));

// ── eval 케이스 (우리가 실제로 겪은 결함 기준) ──────────────────────────
const CASES = [
  {
    name: "고추장 무침 — 간장 환각 금지",
    stage: "base",
    current_state: null,
    messages: [{ role: "user", content: "오이로 고추장 무침 만들래" }],
    checks: [
      { name: "간장 안 들어감", fn: (r) => !hasIng(r, "간장") },
      { name: "고추장 들어감", fn: (r) => hasIng(r, "고추장") },
    ],
  },
  {
    name: "맛 단계 — 게이지 검증 통과(멈춤 방지)",
    stage: "taste",
    current_state: {
      name: "삼겹살 볶음",
      ingredients: [
        { name: "삼겹살", amount: "200g", role: "main" },
        { name: "양파", amount: "1개", role: "sub" },
      ],
    },
    messages: [{ role: "user", content: "매콤하게" }],
    checks: [
      { name: "taste 게이지 존재", fn: (r) => !!r.new_state?.taste },
    ],
  },
  {
    name: "재료 역할 분화(드래프트 시점)",
    stage: "base",
    current_state: { name: "삼겹살 볶음", concept: "삼겹살 채소 볶음" },
    messages: [{ role: "user", content: "재료랑 양념 잡아줘" }],
    checks: [
      {
        name: "role 부여됨",
        fn: (r) => (r.new_state?.ingredients ?? []).some((i) => i.role),
      },
    ],
  },
  {
    name: "메뉴 환각 금지(오이전 등)",
    stage: "concept",
    current_state: null,
    messages: [{ role: "user", content: "오이 있어" }],
    checks: [
      {
        name: "'오이전' 안 나옴",
        fn: (r) =>
          !r.message.includes("오이전") &&
          !(r.options ?? []).some((o) =>
            `${o.label}${o.why ?? ""}`.includes("오이전"),
          ),
      },
      {
        name: "선택지에 why(이유) 있음",
        fn: (r) =>
          (r.options ?? []).length > 0 &&
          (r.options ?? []).some((o) => o.why && o.why.length > 0),
      },
    ],
  },
  {
    name: "에이전트 드래프트 — 방향 정하면 한판(필드 캐묻기 X)",
    stage: "base",
    current_state: { name: "삼겹살 볶음", concept: "삼겹살 채소 볶음" },
    messages: [{ role: "user", content: "좋아, 볶음으로 가자" }],
    checks: [
      {
        name: "재료 3개+ 드래프트(주+부+양념)",
        fn: (r) => (r.new_state?.ingredients ?? []).length >= 3,
      },
      {
        name: "주재료(삼겹살) 포함",
        fn: (r) =>
          (r.new_state?.ingredients ?? []).some((i) =>
            i.name.includes("삼겹살"),
          ),
      },
    ],
  },
];

function extractJson(raw) {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  return s === -1 || e <= s ? null : raw.slice(s, e + 1);
}

async function runOnce(client, c) {
  const system = buildSystemPrompt({
    stage: c.stage,
    buildContext: DEMO_CTX,
    recipeState: c.current_state,
  });
  const resp = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, ...c.messages],
  });
  const raw = resp.choices[0]?.message?.content ?? "";
  const json = extractJson(raw);
  if (!json) return { ok: false, err: "JSON 객체 없음" };
  let parsed;
  try {
    parsed = EngineResponseSchema.safeParse(JSON.parse(json));
  } catch (e) {
    return { ok: false, err: `JSON.parse 실패: ${e.message}` };
  }
  if (parsed.success) {
    const data = parsed.data;
    if (data.new_state?.ingredients) {
      data.new_state.ingredients = enrichIngredientRoles(
        data.new_state.ingredients,
      );
    }
    return { ok: true, data };
  }
  const why = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join(" | ");
  return { ok: false, err: why.slice(0, 240) };
}

async function main() {
  // 1) 키 없이도 프롬프트 빌드 검증 (하네스 자체 점검).
  for (const c of CASES) {
    const sys = buildSystemPrompt({
      stage: c.stage,
      buildContext: DEMO_CTX,
      recipeState: c.current_state,
    });
    if (!sys || sys.length < 100) throw new Error(`프롬프트 빌드 실패: ${c.name}`);
  }
  console.log(`✓ eval 케이스 ${CASES.length}개 · 프롬프트 빌드 OK · 모델 ${MODEL} · 회당 ${RUNS}회`);

  if (!process.env.OPENAI_API_KEY) {
    console.log(
      "\nOPENAI_API_KEY 미설정 — 라이브 평가 스킵.\n키 넣고 다시: OPENAI_API_KEY=sk-... npm run eval",
    );
    return;
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1 });

  let totalChecks = 0;
  let totalPass = 0;
  for (const c of CASES) {
    let valid = 0;
    let sampleErr = null;
    const passCount = Object.fromEntries(c.checks.map((k) => [k.name, 0]));
    for (let i = 0; i < RUNS; i += 1) {
      let res;
      try {
        res = await runOnce(client, c);
      } catch (e) {
        res = { ok: false, err: String(e.message) };
      }
      if (!res.ok) {
        if (!sampleErr) sampleErr = res.err;
        continue;
      }
      valid += 1;
      for (const chk of c.checks) {
        let p = false;
        try {
          p = chk.fn(res.data);
        } catch {
          p = false;
        }
        if (p) passCount[chk.name] += 1;
      }
    }
    console.log(`\n[${c.name}]  검증통과 ${valid}/${RUNS}`);
    if (sampleErr) console.log(`   ⚠ 실패 예: ${sampleErr}`);
    for (const chk of c.checks) {
      const v = passCount[chk.name];
      totalChecks += RUNS;
      totalPass += v;
      const flag = v === RUNS ? "✓" : v === 0 ? "✗" : "△";
      console.log(`   ${flag} ${chk.name}: ${v}/${RUNS}`);
    }
  }
  const pct = totalChecks ? Math.round((totalPass / totalChecks) * 100) : 0;
  console.log(`\n=== 종합: ${totalPass}/${totalChecks} (${pct}%) ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
