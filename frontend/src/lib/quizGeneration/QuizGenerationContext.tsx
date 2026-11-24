"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";

export type GenerationStatus = "idle" | "generating" | "completed" | "error";

export interface QuizGenerationState {
  status: GenerationStatus;
  topic?: string;
  result?: unknown; // Replace with your generated quiz/draft type from @/types/quiz
  error?: string | null;
}

interface QuizGenerationContextValue {
  generation: QuizGenerationState;
  startGeneration: (
    topic: string,
    generatorFn: (signal: AbortSignal) => Promise<unknown>
  ) => Promise<void>;
  clearGeneration: () => void;
}

const QuizGenerationContext = createContext<QuizGenerationContextValue | null>(null);

export function QuizGenerationProvider({ children }: { children: React.ReactNode }) {
  const [generation, setGeneration] = useState<QuizGenerationState>({
    status: "idle",
    error: null,
  });

  // Only abort if a brand-new generation starts or the user explicitly cancels/clears
  const abortControllerRef = useRef<AbortController | null>(null);

  const startGeneration = useCallback(
    async (topic: string, generatorFn: (signal: AbortSignal) => Promise<unknown>) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setGeneration({
        status: "generating",
        topic,
        error: null,
      });

      try {
        const result = await generatorFn(controller.signal);
        setGeneration({
          status: "completed",
          topic,
          result,
          error: null,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setGeneration({
          status: "error",
          topic,
          error: err instanceof Error ? err.message : "Quiz generation failed.",
        });
      }
    },
    []
  );

  const clearGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setGeneration({ status: "idle", error: null });
  }, []);

  return (
    <QuizGenerationContext.Provider
      value={{ generation, startGeneration, clearGeneration }}
    >
      {children}
    </QuizGenerationContext.Provider>
  );
}

export function useQuizGeneration() {
  const ctx = useContext(QuizGenerationContext);
  if (!ctx) {
    throw new Error("useQuizGeneration must be used within a QuizGenerationProvider");
  }
  return ctx;
}