import { useCallback, useState } from "react";
import type { AnalysisRequest, AnalysisResult, ProviderId } from "../../engine/types";
import { validateResponses } from "../../engine/validation";
import { analyze, describeError } from "./api";
import { useApp } from "../state/AppState";
import type { Draft, Target } from "../state/AppState";

export function buildRequest(draft: Draft, target: Target, weights: AnalysisRequest["weights"]): AnalysisRequest {
  return {
    question: draft.question.trim(),
    responses: draft.responses.map((r) => ({ id: r.id, label: r.label.trim() || "Response", text: r.text.trim() })),
    mode: target === "native" ? "native" : "hybrid",
    weights,
  };
}

export function useRunner() {
  const { configFor, slots, weights } = useApp();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const run = useCallback(
    async (draft: Draft, target: Target): Promise<AnalysisResult | null> => {
      setError(null);
      const found = validateResponses(draft.question, draft.responses.map((r) => ({ ...r, label: r.label.trim() || "Response", text: r.text.trim() })));
      setIssues(found);
      if (found.length) return null;
      if (target !== "native" && slots[target as ProviderId].status !== "connected") {
        setError(`${target} is not connected. Open Settings to connect it, or switch to Native analysis.`);
        return null;
      }
      setBusy(true);
      setProgress("Starting…");
      try {
        return await analyze(buildRequest(draft, target, weights), target === "native" ? null : configFor(target as ProviderId), setProgress);
      } catch (e) {
        setError(describeError(e));
        return null;
      } finally {
        setBusy(false);
        setProgress("");
      }
    },
    [configFor, slots, weights]
  );
  return { run, busy, progress, error, issues, setError, setIssues };
}
