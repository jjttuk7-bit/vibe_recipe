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
  const pipeline = [
    {
      key: "build",
      label: "BUILD",
      meta: stage === "done" ? "compiled" : `stage:${stage}`,
      active: mode === "build",
      enabled: true,
      onClick: () => setMode("build"),
    },
    {
      key: "cook",
      label: "COOK",
      meta: canCook ? "runnable" : "no steps",
      active: mode === "cook",
      enabled: canCook,
      onClick: () => setMode("cook"),
    },
    {
      key: "postmortem",
      label: "POSTMORTEM",
      meta: cookEvents.length > 0 ? `${cookEvents.length} events` : "waiting",
      active: mode === "postmortem",
      enabled: cookEvents.length > 0,
      onClick: () => setMode("postmortem"),
    },
    {
      key: "learn",
      label: "LEARN",
      meta: "RuntimeLog -> Fingerprint",
      active: false,
      enabled: false,
      onClick: () => undefined,
    },
  ];

  return (
    <main className="ide-shell">
      <header className="command-header">
        <div className="brand-block">
          <span className="eyebrow">PAIR-COOKING IDE</span>
          <h1>바이브 레시피</h1>
          <p>{"recipe.build() -> kitchen.run() -> postmortem.write()"}</p>
        </div>

        <div className="command-grid" aria-label="runtime credentials">
          <div className="field command-field">
            <label htmlFor="auth-token">AUTH TOKEN</label>
            <input
              id="auth-token"
              value={authToken}
              onChange={(event) => setAuthToken(event.target.value)}
              placeholder="Bearer JWT"
            />
          </div>
          <div className="field command-field">
            <label htmlFor="recipe-id">RECIPE ID</label>
            <input
              id="recipe-id"
              value={recipeId}
              onChange={(event) => setRecipeId(event.target.value)}
              placeholder="uuid"
            />
          </div>
        </div>

        <div className="status-cluster" aria-label="session state">
          <span className="status-pill ok">{authToken ? "auth:armed" : "auth:missing"}</span>
          <span className="status-pill">{recipeId.trim() ? "recipe:linked" : "recipe:manual"}</span>
          <span className="status-pill hot">{mode}.mode</span>
        </div>
      </header>

      <div className="ide-grid">
        <nav className="pipeline-rail" aria-label="runtime pipeline">
          {pipeline.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className="pipeline-node"
              aria-current={item.active}
              disabled={!item.enabled}
              onClick={item.onClick}
            >
              <span className="node-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="node-label">{item.label}</span>
              <span className="node-meta">{item.meta}</span>
            </button>
          ))}
        </nav>

        <section className="workbench" aria-label="active workbench">
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
        </section>

        <aside className="runtime-inspector">
          <div className="inspector-head">
            <span className="eyebrow">RUNTIME CONTEXT</span>
            <h2>부엌 지문 inspector</h2>
          </div>
          <div className="stack">
            <div className="metric-row">
              <span>user.sub</span>
              <strong>{userId ? "parsed" : "missing"}</strong>
            </div>
            <div className="metric-row">
              <span>recipe_id</span>
              <strong>{recipeId.trim() ? "linked" : "manual"}</strong>
            </div>
            <div className="metric-row">
              <span>RecipeState.steps</span>
              <strong>{recipeState?.steps?.length ?? 0}</strong>
            </div>
            <div className="metric-row">
              <span>CookRun.events</span>
              <strong>{cookEvents.length}</strong>
            </div>
            <div className="context-note">
              MVP 환경: 로그인/recipe 생성 API 전까지 JWT와 기존 recipe_id를 직접 연결합니다.
            </div>
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
