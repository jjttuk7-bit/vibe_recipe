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
    <section className="panel" aria-label="build-mode">
      <div className="section-head">
        <div>
          <h2>BUILD</h2>
          <p className="muted">대화로 레시피 상태를 컴파일합니다.</p>
        </div>
        <span className="badge">stage: {stage}</span>
      </div>

      <div className="stack">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="예: 김치랑 계란으로 빠르게 한 끼 만들고 싶어"
        />
        <div className="row">
          <button type="button" onClick={submit} disabled={!canSubmit || busy}>
            {busy ? "빌드 중" : "엔진 호출"}
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
            샘플 로드
          </button>
        </div>
        {error ? <div className="alert">{error}</div> : null}
        {lastResponse ? <p>{lastResponse.message}</p> : null}

        {lastDiff ? (
          <ul className="diff-list" aria-label="diff">
            {lastDiff.created.map((item) => (
              <li key={`created-${String(item.field)}`}>
                <strong>생성</strong> {String(item.field)}
              </li>
            ))}
            {lastDiff.modified.map((item) => (
              <li key={`modified-${String(item.field)}`}>
                <strong>수정</strong> {String(item.field)}
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <h3>현재 RecipeState</h3>
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
      </div>
    </section>
  );
}

function isRecipeSuccessPayload(
  payload: RecipeSuccessPayload | RecipeErrorPayload,
): payload is RecipeSuccessPayload {
  return "engineResponse" in payload;
}
