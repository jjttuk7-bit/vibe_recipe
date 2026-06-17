"use client";

import { useMemo, useState } from "react";
import { splitDiff, type SplitDiff } from "@/lib/diff";
import type { EngineResponse, RecipeState, Stage } from "@/lib/schema";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type RecipeSuccessPayload = { engineResponse: EngineResponse };
type RecipeErrorPayload = { message?: string; error?: string };

export type BuildModeProps = {
  authToken: string;
  recipeId: string | null;
  recipeState: RecipeState | null;
  onRecipeStateChange: (state: RecipeState) => void;
  onStageChange: (stage: Stage) => void;
  stage: Stage;
};

export default function BuildMode({
  authToken,
  recipeId,
  recipeState,
  onRecipeStateChange,
  onStageChange,
  stage,
}: BuildModeProps): React.ReactElement {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastResponse, setLastResponse] = useState<EngineResponse | null>(null);
  const [lastDiff, setLastDiff] = useState<SplitDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = input.trim().length > 0 && authToken.trim().length > 0;
  const previewItems = useMemo(() => {
    if (!recipeState) return [];
    return Object.entries(recipeState).filter(([, value]) => value !== undefined);
  }, [recipeState]);

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const nextMessages: Message[] = [
      ...messages,
      { role: "user" as const, content: input.trim() },
    ].slice(-8);

    try {
      const response = await fetch("/api/recipe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken.trim()}`,
        },
        body: JSON.stringify({
          messages: nextMessages,
          recipe_id: recipeId,
          current_state: recipeState,
          stage,
        }),
      });
      const payload = (await response.json()) as
        | RecipeSuccessPayload
        | RecipeErrorPayload;
      if (!response.ok || !isRecipeSuccessPayload(payload)) {
        const errorPayload = payload as RecipeErrorPayload;
        throw new Error(errorPayload.message ?? errorPayload.error ?? "BUILD 실패");
      }

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
      onStageChange(engineResponse.stage);
      setMessages([
        ...nextMessages,
        { role: "assistant" as const, content: engineResponse.message },
      ].slice(-8));
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel compile-bench" aria-label="build-mode">
      <div className="section-head bench-head">
        <div>
          <span className="eyebrow">BUILD MODE</span>
          <h2>Recipe compiler</h2>
          <p className="muted">대화 입력을 RecipeState 패치로 컴파일합니다.</p>
        </div>
        <span className="badge">compiler.stage::{stage}</span>
      </div>

      <div className="compile-grid">
        <div className="prompt-surface">
          <div className="terminal-bar">
            <span>prompt.stdin</span>
            <span>{messages.length}/8 turns</span>
          </div>
          <div className="prompt-editor">
            <span aria-hidden="true">&gt;</span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="냉장고 상태나 먹고 싶은 느낌을 입력"
            />
          </div>
          <div className="row command-row">
            <button type="button" onClick={submit} disabled={!canSubmit || busy}>
              {busy ? "compiling..." : "compile recipe"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const sample: RecipeState = {
                  name: "팬 김치볶음밥",
                  concept: "김치와 계란으로 만드는 빠른 한 끼",
                  ingredients: [
                    { name: "밥", amount: "1공기" },
                    { name: "김치", amount: "1/2컵" },
                    { name: "계란", amount: "1개" },
                  ],
                  tools: ["팬", "주걱"],
                  time_min: 12,
                  steps: [
                    { text: "팬을 중불로 달구고 김치를 볶아 수분을 날린다.", timer_sec: 120 },
                    { text: "밥을 넣고 김치와 고르게 섞는다.", timer_sec: 90 },
                    { text: "한쪽에 계란을 익힌 뒤 밥과 섞어 마무리한다.", timer_sec: 60 },
                  ],
                };
                onRecipeStateChange(sample);
                onStageChange("done");
              }}
            >
              load fixture
            </button>
          </div>
        </div>

        <div className="compiler-output">
          <div className="terminal-bar">
            <span>compiler.stdout</span>
            <span>{lastResponse ? "ok" : "idle"}</span>
          </div>
          {error ? <div className="alert">{error}</div> : null}
          {lastResponse ? (
            <div className="output-line">{lastResponse.message}</div>
          ) : (
            <div className="output-line muted">엔진 출력이 여기에 표시됩니다.</div>
          )}

          {lastDiff ? (
            <ul className="diff-list artifact-list" aria-label="diff">
              {lastDiff.created.map((item) => (
                <li key={`created-${String(item.field)}`}>
                  <span className="diff-kind created">artifact</span>
                  <strong>{String(item.field)}</strong>
                </li>
              ))}
              {lastDiff.modified.map((item) => (
                <li key={`modified-${String(item.field)}`}>
                  <span className="diff-kind modified">patch</span>
                  <strong>{String(item.field)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="state-inspector">
        <div className="terminal-bar">
          <span>RecipeState.object</span>
          <span>{previewItems.length} fields</span>
        </div>
        {previewItems.length === 0 ? (
          <p className="muted">아직 확정된 필드가 없습니다.</p>
        ) : (
          <ul className="recipe-list">
            {previewItems.map(([key, value]) => (
              <li key={key}>
                <strong>{key}</strong>
                <pre>{JSON.stringify(value, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function isRecipeSuccessPayload(
  payload: RecipeSuccessPayload | RecipeErrorPayload,
): payload is RecipeSuccessPayload {
  return "engineResponse" in payload;
}
