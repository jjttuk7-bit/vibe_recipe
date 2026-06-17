"use client";

import { useState } from "react";
import type { CookRun, Outcome, StepEvent } from "@/lib/schema";

type PostmortemProps = {
  authToken: string;
  recipeId: string | null;
  userId: string | null;
  startedAt: string | null;
  events: StepEvent[];
  stepCount: number;
  onSaved: () => void;
};

const OUTCOMES: Array<{ value: NonNullable<Outcome>; label: string }> = [
  { value: "good", label: "좋음" },
  { value: "meh", label: "그냥" },
  { value: "failed", label: "망함" },
];

export default function Postmortem({
  authToken,
  recipeId,
  userId,
  startedAt,
  events,
  stepCount,
  onSaved,
}: PostmortemProps): React.ReactElement {
  const [outcome, setOutcome] = useState<NonNullable<Outcome> | null>(null);
  const [failedStep, setFailedStep] = useState("0");
  const [failedNote, setFailedNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    Boolean(authToken && recipeId && userId && startedAt && outcome) &&
    (outcome !== "failed" || failedStep.length > 0);

  async function submit(): Promise<void> {
    if (!canSubmit || !recipeId || !userId || !startedAt || !outcome) return;
    setBusy(true);
    setStatus(null);

    const finalEvents = [...events];
    if (outcome === "failed") {
      finalEvents.push({
        step_index: Number.parseInt(failedStep, 10),
        type: "failed_here",
        note: failedNote.trim() || undefined,
        timestamp: new Date().toISOString(),
      });
    }

    const run: CookRun = {
      id: crypto.randomUUID(),
      recipe_id: recipeId,
      user_id: userId,
      started_at: startedAt,
      completed: true,
      outcome,
      step_events: finalEvents,
    };

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(run),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "저장 실패");
      }
      setStatus("저장됐습니다. 다음 BUILD부터 이 기록이 회귀 방지에 쓰입니다.");
      onSaved();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="postmortem">
      <div className="section-head">
        <div>
          <h2>POSTMORTEM</h2>
          <p className="muted">조리 결과를 RuntimeLog와 Fingerprint로 보냅니다.</p>
        </div>
        <span className="badge">건너뛰기 없음</span>
      </div>

      {!recipeId || !userId ? (
        <div className="alert">
          저장하려면 Supabase JWT와 기존 recipe_id가 필요합니다.
        </div>
      ) : null}

      <div className="stack">
        <div className="outcome-grid">
          {OUTCOMES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={outcome === item.value}
              onClick={() => setOutcome(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {outcome === "failed" ? (
          <div className="stack">
            <label>
              실패한 스텝
              <select
                value={failedStep}
                onChange={(event) => setFailedStep(event.target.value)}
              >
                {Array.from({ length: stepCount }, (_, index) => (
                  <option key={index} value={index}>
                    스텝 {index}
                  </option>
                ))}
              </select>
            </label>
            <input
              value={failedNote}
              onChange={(event) => setFailedNote(event.target.value)}
              placeholder="예: 여기서 탔음"
            />
          </div>
        ) : null}

        <button type="button" onClick={submit} disabled={!canSubmit || busy}>
          {busy ? "저장 중" : "회고 저장"}
        </button>
        {status ? <div className="alert">{status}</div> : null}
      </div>
    </section>
  );
}
