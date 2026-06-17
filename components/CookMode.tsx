"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HotfixCategory, RecipeState, StepEvent } from "@/lib/schema";

type CookModeProps = {
  recipe: RecipeState | null;
  onFinish: (payload: { startedAt: string; events: StepEvent[] }) => void;
};

type StepEventDraft =
  | { step_index: number; type: "done"; note?: string }
  | { step_index: number; type: "timer_done"; note?: string }
  | {
      step_index: number;
      type: "hotfix";
      category: HotfixCategory;
      note?: string;
    }
  | { step_index: number; type: "failed_here"; note?: string };

const HOTFIXES: Array<{ category: HotfixCategory; label: string }> = [
  { category: "salty", label: "짜다" },
  { category: "bland", label: "싱겁다" },
  { category: "burnt", label: "탄다" },
  { category: "watery", label: "묽다" },
  { category: "other", label: "기타" },
];

export default function CookMode({
  recipe,
  onFinish,
}: CookModeProps): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(0);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [startedAt] = useState(() => new Date().toISOString());
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [hotfixCategory, setHotfixCategory] =
    useState<HotfixCategory>("salty");
  const [hotfixNote, setHotfixNote] = useState("");
  const [wakeMessage, setWakeMessage] = useState<string | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const steps = recipe?.steps ?? [];
  const step = steps[currentStep];
  const isLast = currentStep >= steps.length - 1;
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const seconds = (secondsLeft % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  useEffect(() => {
    setSecondsLeft(step?.timer_sec ?? 0);
    setTimerRunning(false);
  }, [step?.timer_sec, currentStep]);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, secondsLeft]);

  useEffect(() => {
    if (!timerRunning || secondsLeft !== 0 || !step) return;
    setTimerRunning(false);
    appendEvent({ step_index: currentStep, type: "timer_done" });
    notifyTimerDone();
  }, [timerRunning, secondsLeft, step, currentStep]);

  useEffect(() => {
    void requestWakeLock();
    return () => {
      void wakeLockRef.current?.release();
    };
  }, []);

  async function requestWakeLock(): Promise<void> {
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      }
    ).wakeLock;
    if (!wakeLock) {
      setWakeMessage("이 브라우저는 화면 켜짐 유지가 없어 화면 잠금 시간을 늘려두면 좋아요.");
      return;
    }
    try {
      wakeLockRef.current = await wakeLock.request("screen");
      setWakeMessage("화면 켜짐 유지가 활성화됐습니다.");
    } catch {
      setWakeMessage("화면 켜짐 유지 요청이 거부됐어요. 조리 중 화면 잠금을 조심해주세요.");
    }
  }

  function appendEvent(event: StepEventDraft): void {
    setEvents((current) => [
      ...current,
      { ...event, timestamp: new Date().toISOString() } as StepEvent,
    ]);
  }

  function notifyTimerDone(): void {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification("타이머 완료", { body: step?.text ?? "다음 스텝으로 갈 시간입니다." });
    }
  }

  async function requestNotifications(): Promise<void> {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  function completeStep(): void {
    if (!step) return;
    appendEvent({ step_index: currentStep, type: "done" });
    if (isLast) {
      onFinish({ startedAt, events: withImmediateDoneEvent(events, currentStep) });
      return;
    }
    setCurrentStep((current) => current + 1);
  }

  function addHotfix(): void {
    if (!step) return;
    appendEvent({
      step_index: currentStep,
      type: "hotfix",
      category: hotfixCategory,
      note: hotfixNote.trim() || undefined,
    });
    setHotfixNote("");
  }

  if (!recipe || steps.length === 0) {
    return (
      <section className="panel" aria-label="cook-mode">
        <h2>COOK</h2>
        <p className="muted">조리할 steps가 있는 레시피가 필요합니다.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="cook-mode">
      <div className="section-head">
        <div>
          <h2>COOK</h2>
          <p className="muted">{recipe.name ?? "이름 없는 레시피"}</p>
        </div>
        <span className="badge">
          {currentStep + 1}/{steps.length}
        </span>
      </div>

      <div className="step-stage">
        <h3>{step?.text}</h3>
        {step && step.timer_sec > 0 ? (
          <div className="timer" aria-live="polite">
            {formattedTime}
          </div>
        ) : (
          <p className="muted">타이머 없는 스텝입니다.</p>
        )}
        <div className="row">
          <button
            type="button"
            onClick={() => {
              void requestNotifications();
              setTimerRunning(true);
            }}
            disabled={!step || step.timer_sec === 0 || timerRunning}
          >
            타이머 시작
          </button>
          <button type="button" className="secondary" onClick={completeStep}>
            {isLast ? "회고로 이동" : "스텝 완료"}
          </button>
        </div>
      </div>

      {wakeMessage ? <div className="alert">{wakeMessage}</div> : null}

      <div className="stack">
        <h3>인라인 핫픽스</h3>
        <div className="hotfix-grid">
          {HOTFIXES.map((item) => (
            <button
              key={item.category}
              type="button"
              aria-pressed={hotfixCategory === item.category}
              onClick={() => setHotfixCategory(item.category)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          value={hotfixNote}
          onChange={(event) => setHotfixNote(event.target.value)}
          placeholder="예: 불을 낮춤, 물을 조금 추가"
        />
        <button type="button" className="secondary" onClick={addHotfix}>
          이번 회차에만 기록
        </button>
      </div>

      <ul className="event-list">
        {events.map((event, index) => (
          <li key={`${event.timestamp}-${index}`}>
            <strong>{event.type}</strong> 스텝 {event.step_index}
            {"note" in event && event.note ? ` · ${event.note}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function withImmediateDoneEvent(
  events: StepEvent[],
  stepIndex: number,
): StepEvent[] {
  return [
    ...events,
    {
      step_index: stepIndex,
      type: "done",
      timestamp: new Date().toISOString(),
    },
  ];
}
