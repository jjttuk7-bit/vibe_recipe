"use client";

import { useState } from "react";
import BuildMode from "@/components/BuildMode";
import type { RecipeState, Stage } from "@/lib/schema";

// 데모 모드(2026-06-28): BUILD 전용. 로그인/인증/Cook/Postmortem/Fingerprint 제거.
// 누구나 재료를 입력하면 셰프가 레시피를 빌드한다. (저장/회귀학습은 비활성.)
export default function HomePage(): React.ReactElement {
  const [stage, setStage] = useState<Stage>("concept");
  const [recipeState, setRecipeState] = useState<RecipeState | null>(null);

  return (
    <main className="ide-shell">
      <header className="command-header">
        <div className="brand-block">
          <span className="brand-line">
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-name">vibe recipe</span>
          </span>
        </div>
      </header>

      <section className="mode-stage" aria-label="build">
        <BuildMode
          recipeState={recipeState}
          onRecipeStateChange={setRecipeState}
          stage={stage}
          onStageChange={setStage}
        />
      </section>
    </main>
  );
}
