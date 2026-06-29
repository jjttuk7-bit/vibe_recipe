"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { splitDiff, type SplitDiff } from "@/lib/diff";
import type {
  EngineResponse,
  RecipeState,
  Stage,
  Taste,
  Texture,
} from "@/lib/schema";
import {
  loadFingerprint,
  recordFeedback,
  traitLabels,
  FEEDBACK_LABELS,
  type FeedbackKind,
  type LocalFingerprint,
} from "@/lib/localFingerprint";

// BuildMode — 2-pane (D-027 + D-021/D-022/D-023/D-024/D-025/D-026 누적).
//
// 구조:
//   <section build-bench>
//     <bench-head>           ← 인사/뱃지 (간소)
//     <stage-progress>       ← 5단계 진행
//     <div build-canvas>     ← 2-pane grid
//       <div chat-side>
//         <chat-scroll>      ← 대화 + 옵션 칩
//         <build-input>      ← 입력 + 보조 + 원형 ↑
//       <div recipe-side>
//         <RecipeCanvas>     ← 산출물 + 메타 + 변경/경고 (D-022 mutable)

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ContextUsed = {
  cold_start: boolean;
  known_issues_count: number;
  traits_applied: Array<{ key: string; label: string; confidence: number }>;
};

type RecipeSuccessPayload = {
  engineResponse: EngineResponse;
  parsedAt?: string;
  context_used?: ContextUsed;
};
type RecipeErrorPayload = { message?: string; error?: string };

export type BuildModeProps = {
  recipeState: RecipeState | null;
  onRecipeStateChange: (state: RecipeState | null) => void;
  onStageChange: (stage: Stage) => void;
  stage: Stage;
};

const STAGES: { key: Stage; label: string }[] = [
  { key: "concept", label: "컨셉" },
  { key: "base", label: "재료" },
  { key: "taste", label: "맛·식감" },
  { key: "steps", label: "스텝" },
  { key: "done", label: "빌드 완료" },
];

const COLD_START_GREETING =
  "냉장고에 뭐 있어? 재료랑 제약(도구, 시간, 기분)을 던져주면 같이 빌드해보자. 한 번에 다 안 만들고, 컨셉부터 한 단계씩 갈게.";

const INPUT_PLACEHOLDER = "답하거나, 칩을 탭하거나, '알아서 다 해줘'";

// D-028 cold-start hero
const HERO_TITLE = "오늘, 뭐가 있어요?";
const HERO_SUBTITLE = "재료만 알려주면 같이 한 접시 완성해요.";
const HERO_INPUT_PLACEHOLDER = "두부 한 모, 신김치, 대파... 냉장고를 적어보세요!";
const HERO_QUICK_STARTS = [
  "냉장고 털기",
  "10분 야식",
  "다이어트 한 끼",
  "손님 초대상",
  "아이 반찬",
];

const TASTE_LABELS: Record<keyof Taste, string> = {
  spicy: "매운맛",
  salty: "짠맛",
  sweet: "단맛",
  sour: "신맛",
  umami: "감칠맛",
  fatty: "기름짐",
};

const TEXTURE_LABELS: Record<keyof Texture, string> = {
  crispy: "바삭",
  soft: "부드러움",
  chewy: "쫄깃",
  soupy: "국물",
  thick: "걸쭉",
};

// ───────────────────────────────────────────────────────────────
// Mutation (D-022)
// ───────────────────────────────────────────────────────────────

type Mutation =
  | { kind: "ingredient_remove"; index: number; name: string }
  | { kind: "tool_remove"; index: number; name: string }
  | {
      kind: "gauge_change";
      group: "taste" | "texture";
      key: keyof Taste | keyof Texture;
      from: number;
      to: number;
    };

type Snapshot = {
  recipeState: RecipeState | null;
  lastDiff: SplitDiff | null;
  lastResponse: EngineResponse | null;
  lastContext: ContextUsed | null;
  messages: Message[];
  stage: Stage;
};

export default function BuildMode({
  recipeState,
  onRecipeStateChange,
  onStageChange,
  stage,
}: BuildModeProps): React.ReactElement {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastResponse, setLastResponse] = useState<EngineResponse | null>(null);
  const [lastDiff, setLastDiff] = useState<SplitDiff | null>(null);
  const [lastContext, setLastContext] = useState<ContextUsed | null>(null);
  const [busy, setBusy] = useState(false);
  // D-029 — 스트리밍 중 셰프 버블에 흘러나오는 평문. null=비스트리밍.
  const [streamingText, setStreamingText] = useState<string | null>(null);
  // 복수 선택(options_mode=multi) 시 토글된 항목들.
  const [picked, setPicked] = useState<string[]>([]);
  // 완성 레시피 복사 확인 토스트.
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevSnapshot, setPrevSnapshot] = useState<Snapshot | null>(null);

  // 로컬 학습 — 부엌 지문 (localStorage). SSR 안전: 마운트 후 로드.
  const [fingerprint, setFingerprint] = useState<LocalFingerprint>(() => ({
    counts: {},
    totalMeals: 0,
    updatedAt: "",
  }));
  const [savedKind, setSavedKind] = useState<FeedbackKind | null>(null);
  useEffect(() => {
    setFingerprint(loadFingerprint());
  }, []);
  const learnedTraits = useMemo(
    () => traitLabels(fingerprint),
    [fingerprint],
  );

  function onFeedback(kind: FeedbackKind): void {
    setFingerprint(recordFeedback(kind));
    setSavedKind(kind);
    window.setTimeout(() => setSavedKind(null), 2200);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, busy, lastResponse, streamingText]);

  const currentIdx = STAGES.findIndex((s) => s.key === stage);

  const lastAssistantIdx = useMemo(
    () => findLastIndex(messages, (m) => m.role === "assistant"),
    [messages],
  );
  const pendingUserCount = messages.length - 1 - lastAssistantIdx;

  function canSubmit(text: string): boolean {
    if (busy) return false;
    if (text.trim().length > 0) return true;
    return pendingUserCount > 0;
  }

  function takeSnapshot(): Snapshot {
    return { recipeState, lastDiff, lastResponse, lastContext, messages, stage };
  }

  function togglePick(opt: string): void {
    setPicked((p) =>
      p.includes(opt) ? p.filter((x) => x !== opt) : [...p, opt],
    );
  }

  function copyRecipe(): void {
    if (!recipeState) return;
    void navigator.clipboard?.writeText(recipeToText(recipeState));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function submit(text?: string): Promise<void> {
    const userText = (text ?? input).trim();
    if (!canSubmit(userText)) return;
    setBusy(true);
    setError(null);
    setPicked([]);
    setPrevSnapshot(takeSnapshot());

    const baseMessages: Message[] =
      userText.length > 0
        ? [...messages, { role: "user" as const, content: userText }]
        : messages;
    const wireMessages = baseMessages.slice(-8);

    // 낙관적 전환 — 사용자 메시지를 즉시 띄워 hero→2-pane 전환을 미루지 않는다.
    // (첫 응답을 기다리는 동안 "멈춘 느낌" 제거. 셰프 스트리밍 버블이 바로 보임.)
    setMessages(baseMessages);
    setStreamingText("");
    try {
      const response = await fetch("/api/recipe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: wireMessages,
          recipe_id: null,
          current_state: recipeState,
          stage,
          // 로컬 학습 — 다음 빌드에 부엌 지문 주입(선제 보정).
          client_traits: learnedTraits,
        }),
      });

      // D-029 — 스트림 시작 전 실패(rate limit/auth/buildContext)는 일반 JSON 에러.
      if (!response.ok || !response.body) {
        const errorPayload = (await response
          .json()
          .catch(() => ({}))) as RecipeErrorPayload;
        throw new Error(
          errorPayload.message ?? errorPayload.error ?? "BUILD 실패",
        );
      }

      // D-029 — SSE 2단계 스트림 소비. 평문은 실시간, new_state 는 done 에서 1건.
      const payload = await consumeRecipeStream(response.body, (text) =>
        setStreamingText(text),
      );

      const engineResponse = payload.engineResponse;
      const mergedState = engineResponse.new_state
        ? ({ ...(recipeState ?? {}), ...engineResponse.new_state } as RecipeState)
        : recipeState;

      if (engineResponse.new_state && mergedState) {
        setLastDiff(splitDiff(recipeState, engineResponse.new_state));
        onRecipeStateChange(mergedState);
      } else {
        setLastDiff(null);
      }

      setLastResponse(engineResponse);
      setLastContext(payload.context_used ?? null);
      onStageChange(engineResponse.stage);
      setMessages([
        ...baseMessages,
        { role: "assistant" as const, content: engineResponse.message },
      ]);
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStreamingText(null);
    }
  }

  function applyMutation(m: Mutation): void {
    if (!recipeState) return;
    setPrevSnapshot(takeSnapshot());
    const next = mutateRecipe(recipeState, m);
    const msg = describeMutation(m);
    onRecipeStateChange(next);
    setMessages((prev) => [...prev, { role: "user" as const, content: msg }]);
  }

  function undoLast(): void {
    if (!prevSnapshot) return;
    onRecipeStateChange(prevSnapshot.recipeState);
    setLastDiff(prevSnapshot.lastDiff);
    setLastResponse(prevSnapshot.lastResponse);
    setLastContext(prevSnapshot.lastContext);
    setMessages(prevSnapshot.messages);
    onStageChange(prevSnapshot.stage);
    setPrevSnapshot(null);
  }

  // 대화는 통째로 남긴다(접지 않음) — 바이브 코딩처럼 전체 히스토리 유지.
  // "진짜 이 레시피를 만드는 중" 몰입을 위해 끊지 않고 쭉 스크롤되게.
  const visibleMessages = messages;
  const lastAssistantIdxInVisible = findLastIndex(
    visibleMessages,
    (m) => m.role === "assistant",
  );

  const editableNow = !busy;
  const hasResponse = lastResponse !== null && recipeState !== null;

  // D-028 cold-start hero — 첫 입력 전 단계만
  const showHero = messages.length === 0 && lastResponse === null;
  if (showHero) {
    return (
      <ColdStartHero
        input={input}
        onInputChange={setInput}
        onSubmit={(text) => void submit(text)}
        onQuickStart={(label) => void submit(label)}
        busy={busy}
        canSubmit={canSubmit(input)}
        error={error}
        learnedTraits={learnedTraits}
      />
    );
  }

  return (
    <section className="panel build-bench" aria-label="build-mode">
      <ol className="stage-progress" aria-label="build stages">
        {STAGES.map((s, idx) => {
          const status =
            idx < currentIdx ? "done" : idx === currentIdx ? "active" : "pending";
          return (
            <li key={s.key} className={`stage-pill stage-${status}`}>
              <span className="stage-marker" aria-hidden="true">
                {status === "done" ? "✓" : status === "active" ? "◎" : "○"}
              </span>
              <span className="stage-label">{s.label}</span>
            </li>
          );
        })}
      </ol>

      {learnedTraits.length > 0 ? (
        <div className="learned-bar" aria-label="학습된 부엌 지문">
          <span className="learned-tag">🍳 내 부엌이 기억해요</span>
          {learnedTraits.map((t) => (
            <span key={t} className="learned-chip">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="build-canvas">
        {/* ── 좌측: 대화 + 입력 ─────────────────────── */}
        <div className="chat-side">
          <div className="chat-scroll" ref={scrollRef} aria-live="polite">
            <ChatBubble role="chef" speaker="pair-chef">
              <p className="bubble-text">{COLD_START_GREETING}</p>
            </ChatBubble>

            {visibleMessages.map((msg, idx) => {
              if (msg.role === "user") {
                return (
                  <ChatBubble key={idx} role="user" speaker="you">
                    <p className="bubble-text">{msg.content}</p>
                  </ChatBubble>
                );
              }
              const isLatest = idx === lastAssistantIdxInVisible;
              return (
                <ChatBubble key={idx} role="chef" speaker="pair-chef">
                  <p className="bubble-text">{msg.content}</p>
                  {isLatest && lastResponse && lastResponse.options.length > 0 ? (
                    lastResponse.options_mode === "multi" ? (
                      <div
                        className="option-chips multi"
                        role="group"
                        aria-label="옵션 (여러 개 선택 가능)"
                      >
                        {lastResponse.options.map((opt, i) => {
                          const on = picked.includes(opt.label);
                          return (
                            <button
                              key={`${i}-${opt.label}`}
                              type="button"
                              className={`option-chip${on ? " picked" : ""}${opt.why ? " has-why" : ""}`}
                              onClick={() => togglePick(opt.label)}
                              disabled={busy}
                              aria-pressed={on}
                            >
                              <span className="opt-label">
                                {on ? "✓ " : ""}
                                {opt.label}
                              </span>
                              {opt.why ? (
                                <span className="opt-why">{opt.why}</span>
                              ) : null}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className="option-confirm"
                          onClick={() =>
                            void submit(
                              picked.length > 0 ? picked.join(", ") : "이대로 좋아",
                            )
                          }
                          disabled={busy}
                        >
                          {picked.length > 0
                            ? `이걸로 → (${picked.length})`
                            : "이대로 좋아 →"}
                        </button>
                      </div>
                    ) : (
                      <div className="option-chips" role="group" aria-label="옵션">
                        {lastResponse.options.map((opt, i) => (
                          <button
                            key={`${i}-${opt.label}`}
                            type="button"
                            className={`option-chip${opt.why ? " has-why" : ""}`}
                            onClick={() => void submit(opt.label)}
                            disabled={busy}
                          >
                            <span className="opt-label">{opt.label}</span>
                            {opt.why ? (
                              <span className="opt-why">{opt.why}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )
                  ) : null}
                  {isLatest && lastResponse && lastResponse.warnings.length > 0 ? (
                    <ul className="warning-card warning-inline">
                      {lastResponse.warnings.map((w, i) => (
                        <li key={i} className="warning-row">
                          ⚠ {w}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </ChatBubble>
              );
            })}

            {busy ? (
              <ChatBubble role="chef" speaker="pair-chef">
                {streamingText && streamingText.length > 0 ? (
                  <p className="bubble-text">
                    {streamingText}
                    <span className="stream-caret" aria-hidden="true" />
                  </p>
                ) : (
                  <p className="typing-indicator">생각 중…</p>
                )}
              </ChatBubble>
            ) : null}

            {error ? <div className="alert chat-alert">{error}</div> : null}
          </div>

          {stage === "done" ? (
            <div className="cook-feedback done-card" aria-label="완성 / 요리 피드백">
              <div className="done-head">
                <span className="done-title">✅ 레시피 완성!</span>
                {recipeState ? (
                  <button
                    type="button"
                    className="copy-recipe-btn"
                    onClick={copyRecipe}
                  >
                    {copied ? "복사됨 ✓" : "📋 레시피 복사"}
                  </button>
                ) : null}
              </div>
              <span className="cook-feedback-q">
                {savedKind
                  ? "기억해둘게요 — 다음 빌드 때 미리 반영할게요 👍"
                  : "📋 복사해서 만들어보고, 어땠는지 알려줘 — 다음 레시피에 반영돼요."}
              </span>
              <div className="cook-feedback-chips">
                {(Object.keys(FEEDBACK_LABELS) as FeedbackKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="feedback-chip"
                    onClick={() => onFeedback(k)}
                    disabled={busy}
                  >
                    {FEEDBACK_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="build-input">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={INPUT_PLACEHOLDER}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="build-input-actions">
              <div className="build-input-aux" aria-label="입력 보조 (P2)">
                <button type="button" className="aux-chip" disabled title="P2 이월 — 사진 첨부">
                  + 사진
                </button>
                <button type="button" className="aux-chip" disabled title="P2 이월 — 음성 입력">
                  ⏵ 음성
                </button>
                <button
                  type="button"
                  className="aux-chip"
                  onClick={undoLast}
                  disabled={!prevSnapshot || busy}
                  title="직전 응답/수정 취소"
                  style={{ cursor: prevSnapshot && !busy ? "pointer" : "not-allowed" }}
                >
                  ↶ 직전 취소
                </button>
              </div>
              <div className="build-input-trailing">
                {pendingUserCount > 0 && input.trim().length === 0 ? (
                  <span className="send-count">{pendingUserCount}개 수정</span>
                ) : null}
                <button
                  type="button"
                  className="send-btn"
                  onClick={() => void submit()}
                  disabled={!canSubmit(input)}
                  aria-label={busy ? "전송 중" : "전송"}
                >
                  {busy ? "…" : "↑"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 우측: sticky RecipeCanvas ─────────────────────── */}
        <div className="recipe-side">
          <RecipeCanvas
            recipeState={recipeState}
            diff={lastDiff}
            stage={stage}
            hasResponse={hasResponse}
            onMutate={applyMutation}
            editable={editableNow}
          />
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────
// ColdStartHero (D-028 첫 진입)
// ───────────────────────────────────────────────────────────────

function ColdStartHero({
  input,
  onInputChange,
  onSubmit,
  onQuickStart,
  busy,
  canSubmit,
  error,
  learnedTraits,
}: {
  input: string;
  onInputChange: (next: string) => void;
  onSubmit: (text?: string) => void;
  onQuickStart: (label: string) => void;
  busy: boolean;
  canSubmit: boolean;
  error: string | null;
  learnedTraits: string[];
}): React.ReactElement {
  const [timeLabel, setTimeLabel] = useState<string>(() => formatTimeLabel(new Date()));

  useEffect(() => {
    const tick = () => setTimeLabel(formatTimeLabel(new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="cold-hero" aria-label="cold-start hero">
      <div className="cold-hero-inner">
        <span className="cold-hero-eyebrow">{timeLabel}</span>
        <h1 className="cold-hero-title">{HERO_TITLE}</h1>
        <p className="cold-hero-subtitle">{HERO_SUBTITLE}</p>

        {learnedTraits.length > 0 ? (
          <div className="learned-bar hero-learned" aria-label="학습된 부엌 지문">
            <span className="learned-tag">🍳 내 부엌 기억</span>
            {learnedTraits.map((t) => (
              <span key={t} className="learned-chip">
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div className="build-input cold-hero-input">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={HERO_INPUT_PLACEHOLDER}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="build-input-actions">
            <div className="build-input-aux" aria-label="입력 보조 (P2)">
              <button type="button" className="aux-chip" disabled title="P2 이월 — 사진 첨부">
                + 사진
              </button>
              <button type="button" className="aux-chip" disabled title="P2 이월 — 음성 입력">
                ⏵ 음성
              </button>
            </div>
            <div className="build-input-trailing">
              <button
                type="button"
                className="send-btn"
                onClick={() => onSubmit()}
                disabled={!canSubmit}
                aria-label={busy ? "전송 중" : "전송"}
              >
                {busy ? "…" : "↑"}
              </button>
            </div>
          </div>
        </div>

        <div className="cold-hero-quickstarts" role="group" aria-label="시작 옵션">
          {HERO_QUICK_STARTS.map((label) => (
            <button
              key={label}
              type="button"
              className="quickstart-chip"
              onClick={() => onQuickStart(label)}
              disabled={busy}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="alert cold-hero-alert">{error}</div> : null}
      </div>
    </section>
  );
}

function formatTimeLabel(date: Date): string {
  const hour = date.getHours();
  const day = date.getDay();
  let zone: string;
  if (hour >= 6 && hour <= 10) zone = "아침";
  else if (hour >= 11 && hour <= 13) zone = "점심";
  else if (hour >= 14 && hour <= 17) zone = "오후";
  else if (hour >= 18 && hour <= 21) zone = "저녁";
  else zone = "밤";
  const dayLabel = day === 0 || day === 6 ? "주말" : "평일 종일";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${zone} ${displayHour}시 · ${dayLabel}`;
}

// ───────────────────────────────────────────────────────────────
// ChatBubble
// ───────────────────────────────────────────────────────────────

function ChatBubble({
  role,
  speaker,
  children,
}: {
  role: "chef" | "user";
  speaker: string;
  children: React.ReactNode;
}): React.ReactElement {
  if (role === "chef") {
    return (
      <div className="chat-bubble bubble-chef">
        <span className="chef-avatar" aria-hidden="true">셰</span>
        <div className="chat-bubble-body-wrap">
          <span className="bubble-speaker">{speaker}</span>
          <div className="bubble-body">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="chat-bubble bubble-user">
      <span className="bubble-speaker">{speaker}</span>
      <div className="bubble-body">{children}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// RecipeCanvas (D-027 — 우측 sticky 산출물 패널)
// ───────────────────────────────────────────────────────────────

function RecipeCanvas({
  recipeState,
  diff,
  stage,
  hasResponse,
  onMutate,
  editable,
}: {
  recipeState: RecipeState | null;
  diff: SplitDiff | null;
  stage: Stage;
  hasResponse: boolean;
  onMutate: (m: Mutation) => void;
  editable: boolean;
}): React.ReactElement {
  // 맛·식감은 기본 읽기(얇은 바), "조절하기" 누르면 −/+ 컨트롤 노출.
  const [gaugeEdit, setGaugeEdit] = useState(false);
  const empty =
    !hasResponse ||
    !recipeState ||
    (recipeState.name === undefined &&
      recipeState.concept === undefined &&
      (recipeState.ingredients?.length ?? 0) === 0);

  if (empty) {
    return (
      <div className="recipe-canvas recipe-canvas-empty">
        <div className="canvas-head">
          <span className="canvas-eyebrow">RECIPE · 대기</span>
          <span className="canvas-live canvas-live-idle">
            <span className="canvas-live-dot" /> idle
          </span>
        </div>
        <div className="canvas-empty-msg">
          왼쪽에서 대화로 시작해주세요. 합의가 시작되면 여기 레시피가 자라납니다.
        </div>
      </div>
    );
  }

  const modifiedCount = diff?.modified.length ?? 0;

  return (
    <div className="recipe-canvas">
      <div className="canvas-head">
        <span className="canvas-eyebrow">
          {stage === "done" ? "✅ 레시피 완성" : "🍳 만드는 중"}
        </span>
        <span className="canvas-head-right">
          {modifiedCount > 0 ? (
            <span className="canvas-modified">
              {modifiedCount}개 수정
            </span>
          ) : null}
          <span className="canvas-live">
            <span className="canvas-live-dot" /> live
          </span>
        </span>
      </div>

      {recipeState!.name ? (
        <h2 className="canvas-title">{recipeState!.name}</h2>
      ) : null}

      {recipeState!.concept ? (
        <p className="canvas-concept">{recipeState!.concept}</p>
      ) : null}

      {recipeState!.time_min !== undefined ? (
        <div className="canvas-meta">
          <span>{recipeState!.time_min}분</span>
        </div>
      ) : null}

      {recipeState!.ingredients && recipeState!.ingredients.length > 0 ? (
        <div className="canvas-section">
          <div className="canvas-section-label">재료</div>
          <IngredientGroups
            ingredients={recipeState!.ingredients}
            editable={editable}
            onMutate={onMutate}
          />
        </div>
      ) : null}

      {recipeState!.tools && recipeState!.tools.length > 0 ? (
        <div className="canvas-section">
          <div className="canvas-section-label">도구</div>
          <div className="artifact-chips">
            {recipeState!.tools.map((t, idx) => (
              <span key={`${idx}-${t}`} className="tool-chip">
                {t}
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`${t} 도구 빼기`}
                  disabled={!editable}
                  onClick={() =>
                    onMutate({ kind: "tool_remove", index: idx, name: t })
                  }
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {(recipeState!.taste !== undefined || recipeState!.texture !== undefined) ? (
        <div className="canvas-section">
          <div className="canvas-section-head">
            <div className="canvas-section-label">맛 · 식감</div>
            {editable ? (
              <button
                type="button"
                className="section-edit-toggle"
                onClick={() => setGaugeEdit((prev) => !prev)}
              >
                {gaugeEdit ? "완료" : "조절하기"}
              </button>
            ) : null}
          </div>
          <div className="gauges-card-inner">
            {recipeState!.taste ? (
              <GaugeGroup
                title="맛"
                group="taste"
                values={recipeState!.taste as Record<string, number>}
                labels={TASTE_LABELS as Record<string, string>}
                onMutate={onMutate}
                editable={editable}
                showControls={gaugeEdit}
              />
            ) : null}
            {recipeState!.texture ? (
              <GaugeGroup
                title="식감"
                group="texture"
                values={recipeState!.texture as Record<string, number>}
                labels={TEXTURE_LABELS as Record<string, string>}
                onMutate={onMutate}
                editable={editable}
                showControls={gaugeEdit}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {recipeState!.steps && recipeState!.steps.length > 0 ? (
        <div className="canvas-section">
          <div className="canvas-section-label">단계</div>
          <ol className="canvas-steps">
            {recipeState!.steps.map((step, idx) => (
              <li key={idx} className="canvas-step">
                <span className="canvas-step-index">{idx + 1}</span>
                <p className="canvas-step-text">
                  {step.text}
                  {step.timer_sec > 0 ? (
                    <span className="canvas-step-timer">{formatTimer(step.timer_sec)}</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

    </div>
  );
}

function GaugeGroup({
  title,
  group,
  values,
  labels,
  onMutate,
  editable,
  showControls,
}: {
  title: string;
  group: "taste" | "texture";
  values: Record<string, number>;
  labels: Record<string, string>;
  onMutate: (m: Mutation) => void;
  editable: boolean;
  showControls: boolean;
}): React.ReactElement {
  return (
    <div className="gauges-group">
      <div className="gauges-group-title">{title}</div>
      <div className="gauges-grid">
        {Object.entries(values).map(([k, v]) => (
          <div key={k} className="gauge-row">
            <span className="gauge-label">{labels[k] ?? k}</span>
            <div
              className="gauge-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={v}
            >
              <div className="gauge-fill" style={{ width: `${(v / 10) * 100}%` }} />
            </div>
            <span className="gauge-val">{v}</span>
            {showControls && editable ? (
              <div className="gauge-buttons">
                <button
                  type="button"
                  className="gauge-btn"
                  aria-label={`${labels[k] ?? k} 낮추기`}
                  disabled={v <= 0}
                  onClick={() =>
                    onMutate({
                      kind: "gauge_change",
                      group,
                      key: k as keyof Taste | keyof Texture,
                      from: v,
                      to: Math.max(0, v - 1),
                    })
                  }
                >
                  −
                </button>
                <button
                  type="button"
                  className="gauge-btn"
                  aria-label={`${labels[k] ?? k} 올리기`}
                  disabled={v >= 10}
                  onClick={() =>
                    onMutate({
                      kind: "gauge_change",
                      group,
                      key: k as keyof Taste | keyof Texture,
                      from: v,
                      to: Math.min(10, v + 1),
                    })
                  }
                >
                  +
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Mutation
// ───────────────────────────────────────────────────────────────

function mutateRecipe(state: RecipeState, m: Mutation): RecipeState {
  switch (m.kind) {
    case "ingredient_remove": {
      const ingredients = (state.ingredients ?? []).filter(
        (_, idx) => idx !== m.index,
      );
      return { ...state, ingredients };
    }
    case "tool_remove": {
      const tools = (state.tools ?? []).filter((_, idx) => idx !== m.index);
      return { ...state, tools };
    }
    case "gauge_change": {
      if (m.group === "taste") {
        const taste = { ...(state.taste as Taste), [m.key]: m.to } as Taste;
        return { ...state, taste };
      }
      const texture = {
        ...(state.texture as Texture),
        [m.key]: m.to,
      } as Texture;
      return { ...state, texture };
    }
  }
}

function describeMutation(m: Mutation): string {
  switch (m.kind) {
    case "ingredient_remove":
      return `재료에서 '${m.name}' 뺐어`;
    case "tool_remove":
      return `'${m.name}' 도구는 빼고 가자`;
    case "gauge_change": {
      const labels: Record<string, string> = {
        ...TASTE_LABELS,
        ...TEXTURE_LABELS,
      };
      const label = labels[m.key as string] ?? String(m.key);
      return `${label} ${m.from} → ${m.to}`;
    }
  }
}

// ───────────────────────────────────────────────────────────────
// 유틸
// ───────────────────────────────────────────────────────────────

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}

// 재료를 역할(주재료/부재료/양념/고명)별로 묶어 렌더. remove 는 원본 인덱스 보존.
const ING_ROLE_ORDER = ["main", "sub", "seasoning", "garnish", "etc"] as const;
const ING_ROLE_LABEL: Record<string, string> = {
  main: "주재료",
  sub: "부재료",
  seasoning: "양념",
  garnish: "고명",
  etc: "재료",
};

function IngredientGroups({
  ingredients,
  editable,
  onMutate,
}: {
  ingredients: NonNullable<RecipeState["ingredients"]>;
  editable: boolean;
  onMutate: (m: Mutation) => void;
}): React.ReactElement {
  const withIdx = ingredients.map((ing, idx) => ({ ing, idx }));
  const hasRoles = withIdx.some(({ ing }) => Boolean(ing.role));
  const groups = ING_ROLE_ORDER.map((role) => ({
    role,
    label: ING_ROLE_LABEL[role]!,
    items: withIdx.filter(({ ing }) => (ing.role ?? "etc") === role),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {groups.map((g) => (
        <div key={g.role} className="ingredient-group">
          {hasRoles ? (
            <span className="ingredient-group-label">{g.label}</span>
          ) : null}
          {g.items.map(({ ing, idx }) => (
            <div key={`${idx}-${ing.name}`} className="ing-row">
              <span className="ing-name">
                {ing.name}
                {ing.prep ? <span className="ing-prep"> {ing.prep}</span> : null}
                {ing.optional ? <span className="ing-opt"> 선택</span> : null}
              </span>
              <span className="ing-amount">{ing.amount}</span>
              {editable ? (
                <button
                  type="button"
                  className="ing-remove"
                  aria-label={`${ing.name} 빼기`}
                  onClick={() =>
                    onMutate({
                      kind: "ingredient_remove",
                      index: idx,
                      name: ing.name,
                    })
                  }
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

// 완성 레시피를 복사용 평문으로. (결과 활용 — 부엌에 들고 가서 보기)
function recipeToText(r: RecipeState): string {
  const lines: string[] = [];
  if (r.name) lines.push(`■ ${r.name}`);
  if (r.concept) lines.push(r.concept);
  if (r.ingredients && r.ingredients.length > 0) {
    lines.push("", "[재료]");
    const hasRoles = r.ingredients.some((i) => i.role);
    for (const role of ING_ROLE_ORDER) {
      const items = r.ingredients.filter((i) => (i.role ?? "etc") === role);
      if (items.length === 0) continue;
      if (hasRoles) lines.push(`· ${ING_ROLE_LABEL[role]}`);
      for (const ing of items) {
        const prep = ing.prep ? ` ${ing.prep}` : "";
        const opt = ing.optional ? " (선택)" : "";
        lines.push(`  - ${ing.name}${prep} ${ing.amount}${opt}`);
      }
    }
  }
  if (r.tools && r.tools.length > 0) lines.push("", `[도구] ${r.tools.join(", ")}`);
  if (r.time_min) lines.push(`[시간] 약 ${r.time_min}분`);
  if (r.steps && r.steps.length > 0) {
    lines.push("", "[조리]");
    r.steps.forEach((s, i) => {
      const t = s.timer_sec > 0 ? ` (${Math.round(s.timer_sec / 60)}분)` : "";
      lines.push(`${i + 1}. ${s.text}${t}`);
    });
  }
  lines.push("", "— vibe recipe");
  return lines.join("\n");
}

function findLastIndex<T>(
  arr: readonly T[],
  predicate: (item: T) => boolean,
): number {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}

function isRecipeSuccessPayload(
  payload: RecipeSuccessPayload | RecipeErrorPayload,
): payload is RecipeSuccessPayload {
  return "engineResponse" in payload;
}

// D-029 — SSE 이벤트 합 (app/api/recipe/route.ts StreamEvent 와 1:1).
type StreamClientEvent =
  | { type: "delta"; text: string }
  | { type: "reset" }
  | {
      type: "done";
      engineResponse: EngineResponse;
      parsedAt?: string;
      context_used?: ContextUsed;
    }
  | { type: "error"; error?: string; message?: string };

// 2단계 스트림 소비: `data: {json}\n\n` 프레임을 파싱한다.
//   delta → 누적 평문을 onDelta 로 (실시간 타이핑)
//   reset → 재시도, 누적 폐기
//   done  → 검증된 new_state 동봉 성공 페이로드 (D-001/D-002 보존)
//   error → 2회 실패/네트워크 → throw
async function consumeRecipeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<RecipeSuccessPayload> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let acc = "";
  let done: RecipeSuccessPayload | null = null;
  let streamError: { error?: string; message?: string } | null = null;

  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw.trim();
      if (line) {
        let evt: StreamClientEvent | null = null;
        try {
          evt = JSON.parse(line) as StreamClientEvent;
        } catch {
          evt = null;
        }
        if (evt) {
          if (evt.type === "delta") {
            acc += evt.text;
            onDelta(acc);
          } else if (evt.type === "reset") {
            acc = "";
            onDelta("");
          } else if (evt.type === "done") {
            done = {
              engineResponse: evt.engineResponse,
              parsedAt: evt.parsedAt,
              context_used: evt.context_used,
            };
          } else if (evt.type === "error") {
            streamError = { error: evt.error, message: evt.message };
          }
        }
      }
      sep = buffer.indexOf("\n\n");
    }
  }

  if (streamError) {
    throw new Error(streamError.message ?? streamError.error ?? "BUILD 실패");
  }
  if (!done || !isRecipeSuccessPayload(done)) {
    throw new Error("BUILD 실패");
  }
  return done;
}
