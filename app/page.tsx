"use client";

import { useMemo, useState } from "react";
import BuildMode from "@/components/BuildMode";
import CookMode from "@/components/CookMode";
import Postmortem from "@/components/Postmortem";
import type { RecipeState, Stage, StepEvent } from "@/lib/schema";

type Mode = "build" | "cook" | "postmortem";

export default function HomePage(): React.ReactElement {
  const [mode, setMode] = useState<Mode>("build");
  const [authToken, setAuthToken] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [stage, setStage] = useState<Stage>("concept");
  const [recipeState, setRecipeState] = useState<RecipeState | null>(null);
  const [cookStartedAt, setCookStartedAt] = useState<string | null>(null);
  const [cookEvents, setCookEvents] = useState<StepEvent[]>([]);

  const userId = useMemo(() => readJwtSub(authToken), [authToken]);
  const canCook = Boolean(recipeState?.steps?.length);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>바이브 레시피</h1>
          <p>BUILD → COOK → POSTMORTEM</p>
        </div>
        <div className="field">
          <label htmlFor="auth-token">Supabase bearer JWT</label>
          <input
            id="auth-token"
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            placeholder="eyJ..."
          />
        </div>
        <div className="field">
          <label htmlFor="recipe-id">기존 recipe_id</label>
          <input
            id="recipe-id"
            value={recipeId}
            onChange={(event) => setRecipeId(event.target.value)}
            placeholder="uuid"
          />
        </div>
      </header>

      <nav className="mode-tabs" aria-label="mode">
        <button
          type="button"
          aria-current={mode === "build"}
          onClick={() => setMode("build")}
        >
          BUILD
        </button>
        <button
          type="button"
          aria-current={mode === "cook"}
          disabled={!canCook}
          onClick={() => setMode("cook")}
        >
          COOK
        </button>
        <button
          type="button"
          aria-current={mode === "postmortem"}
          disabled={cookEvents.length === 0}
          onClick={() => setMode("postmortem")}
        >
          POSTMORTEM
        </button>
      </nav>

      <div className="workspace">
        {mode === "build" ? (
          <BuildMode
            authToken={authToken}
            recipeId={recipeId.trim() || null}
            recipeState={recipeState}
            onRecipeStateChange={setRecipeState}
            stage={stage}
            onStageChange={setStage}
          />
        ) : null}
        {mode === "cook" ? (
          <CookMode
            recipe={recipeState}
            onFinish={({ startedAt, events }) => {
              setCookStartedAt(startedAt);
              setCookEvents(events);
              setMode("postmortem");
            }}
          />
        ) : null}
        {mode === "postmortem" ? (
          <Postmortem
            authToken={authToken.trim()}
            recipeId={recipeId.trim() || null}
            userId={userId}
            startedAt={cookStartedAt}
            events={cookEvents}
            stepCount={recipeState?.steps?.length ?? 0}
            onSaved={() => setMode("build")}
          />
        ) : null}

        <aside className="side-panel">
          <h2>상태</h2>
          <div className="stack">
            <span className="badge">user: {userId ?? "JWT 필요"}</span>
            <span className="badge">recipe: {recipeId.trim() || "미입력"}</span>
            <span className="badge">steps: {recipeState?.steps?.length ?? 0}</span>
            <p className="muted">
              현재는 로그인 UI와 recipe row 생성 API가 없어 JWT와 기존 recipe_id를
              직접 넣는 작업용 화면입니다.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function readJwtSub(token: string): string | null {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(window.atob(normalized)) as { sub?: unknown };
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}
