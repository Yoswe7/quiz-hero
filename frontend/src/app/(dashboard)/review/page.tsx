"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import {
  fetchAllReviewItems,
  fetchDueItems,
  ReviewItem,
  submitReview,
} from "@/lib/srs";
import { useAuth } from "@/lib/auth/AuthContext";
import { fetchStudentProgress, StudentProgress } from "@/lib/api";
import LessonFlashcardModal from "@/components/review/LessonFlashcardModal";

type ReviewMode = "due" | "practice";

const RATING_OPTIONS = [
  {
    key: "1",
    label: "Again",
    quality: 1,
    className:
      "border-rose-200 bg-rose-50/80 text-rose-900 hover:border-rose-400 hover:bg-rose-100/80",
    badgeClass: "bg-rose-100 text-rose-700",
  },
  {
    key: "2",
    label: "Hard",
    quality: 2,
    className:
      "border-amber-200 bg-amber-50/80 text-amber-900 hover:border-amber-400 hover:bg-amber-100/80",
    badgeClass: "bg-amber-100 text-amber-700",
  },
  {
    key: "3",
    label: "Good",
    quality: 4,
    className:
      "border-cvsu-green/40 bg-cvsu-light/80 text-cvsu-dark hover:border-cvsu-green hover:bg-cvsu-light",
    badgeClass: "bg-cvsu-green/15 text-cvsu-dark",
  },
  {
    key: "4",
    label: "Easy",
    quality: 5,
    className:
      "border-cvsu-dark/30 bg-cvsu-dark text-white hover:border-cvsu-dark hover:bg-cvsu-dark/90",
    badgeClass: "bg-white/15 text-white",
  },
] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "textarea" || tag === "input" || tag === "select" || target.isContentEditable;
}

export default function ReviewPage() {
  const { user, isLoaded } = useAuth();
  const [mode, setMode] = useState<ReviewMode>("due");
  const [dueItems, setDueItems] = useState<ReviewItem[]>([]);
  const [practiceItems, setPracticeItems] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showRecallInput, setShowRecallInput] = useState(false);
  const [recall, setRecall] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [lastScheduled, setLastScheduled] = useState<string | null>(null);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);

  const activeItems = mode === "due" ? dueItems : practiceItems;
  const item = activeItems[index];

  const resetCardState = useCallback(() => {
    setIsFlipped(false);
    setShowRecallInput(false);
    setRecall("");
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [due, allItems, studentProgress] = await Promise.all([
        fetchDueItems(),
        fetchAllReviewItems(),
        fetchStudentProgress(),
      ]);
      setDueItems(Array.isArray(due) ? due : []);
      setPracticeItems(Array.isArray(allItems) ? allItems : []);
      setProgress(studentProgress ?? null);
      setIndex(0);
      resetCardState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load due reviews.");
    } finally {
      setLoading(false);
    }
  }, [resetCardState]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    const timer = window.setTimeout(() => void loadItems(), 0);
    return () => window.clearTimeout(timer);
  }, [isLoaded, user, loadItems]);

  const handleModeSwitch = useCallback(
    (nextMode: ReviewMode) => {
      if (nextMode === mode) return;
      setMode(nextMode);
      setIndex(0);
      setError("");
      setLastScheduled(null);
      resetCardState();
    },
    [mode, resetCardState]
  );

  const handleReview = useCallback(
    async (quality: number) => {
      if (!item || saving || mode !== "due") return;
      setSaving(true);
      setError("");
      try {
        const updatedItem = await submitReview(item.id, quality);
        setLastScheduled(updatedItem.next_review_at);
        resetCardState();

        setPracticeItems((current) =>
          current.map((card) => (card.id === updatedItem.id ? updatedItem : card))
        );

        setProgress((current) => {
          if (!current) return current;
          const isScheduledFuture =
            Boolean(updatedItem.next_review_at) &&
            Boolean(updatedItem.last_reviewed_at) &&
            new Date(updatedItem.next_review_at as string).getTime() >
              new Date(updatedItem.last_reviewed_at as string).getTime();
          const dueDelta = isScheduledFuture ? -1 : 0;
          const reviewedDelta =
            item.last_reviewed_at === null && updatedItem.last_reviewed_at !== null ? 1 : 0;
          const wasMastered = item.repetitions >= 3;
          const isMastered = updatedItem.repetitions >= 3;
          const masteredDelta = (isMastered ? 1 : 0) - (wasMastered ? 1 : 0);

          const nextTotal = current.srs.total_items;
          const nextDue = Math.max(0, current.srs.due_reviews + dueDelta);
          const nextReviewed = Math.min(
            nextTotal,
            Math.max(0, current.srs.reviewed_items + reviewedDelta)
          );
          const nextMastered = Math.min(
            nextTotal,
            Math.max(0, current.srs.mastered_items + masteredDelta)
          );
          const nextRetention =
            nextTotal > 0 ? Math.round((nextMastered / nextTotal) * 1000) / 10 : 0;

          return {
            ...current,
            srs: {
              ...current.srs,
              due_reviews: nextDue,
              reviewed_items: nextReviewed,
              mastered_items: nextMastered,
              retention_percentage: nextRetention,
            },
          };
        });

        if (index + 1 >= dueItems.length) {
          await loadItems();
        } else {
          try {
            const freshProgress = await fetchStudentProgress();
            setProgress(freshProgress);
          } catch {
            // Keep optimistic KPI counts if background refresh fails transiently
          }
          setIndex((current) => current + 1);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to save review.");
      } finally {
        setSaving(false);
      }
    },
    [dueItems.length, index, item, loadItems, mode, resetCardState, saving]
  );

  const handlePracticeStep = useCallback(
    (delta: number) => {
      if (practiceItems.length === 0) return;
      setIndex((current) => {
        const next = current + delta;
        if (next < 0) return practiceItems.length - 1;
        if (next >= practiceItems.length) return 0;
        return next;
      });
      resetCardState();
    },
    [practiceItems.length, resetCardState]
  );

  const handleShufflePractice = useCallback(() => {
    if (practiceItems.length <= 1) return;
    setPracticeItems((current) => {
      const copy = [...current];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
    setIndex(0);
    resetCardState();
  }, [practiceItems.length, resetCardState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (lessonModalOpen || isTypingTarget(event.target)) return;
      if (!item) return;

      if (event.code === "Space") {
        event.preventDefault();
        setIsFlipped((prev) => !prev);
        return;
      }

      if (mode === "due" && isFlipped && !saving) {
        const matched = RATING_OPTIONS.find((opt) => opt.key === event.key);
        if (matched) {
          event.preventDefault();
          void handleReview(matched.quality);
        }
        return;
      }

      if (mode === "practice") {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          handlePracticeStep(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          handlePracticeStep(1);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePracticeStep, handleReview, isFlipped, item, lessonModalOpen, mode, saving]);

  const handleCardSurfaceClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, textarea, input, a, [data-no-flip='true']")) {
      return;
    }
    setIsFlipped((prev) => !prev);
  };

  if (!isLoaded || !user) return null;
  if (loading) {
    return <div className="py-16 text-center text-sm font-semibold text-cvsu-green">Loading flashcards...</div>;
  }
  if (error && activeItems.length === 0) {
    return <div className="py-16 text-center text-sm font-semibold text-red-600">{error}</div>;
  }

  const totalCount = activeItems.length;
  const progressPercent = totalCount > 0 ? Math.round(((index + 1) / totalCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      {/* Compact Header & Segmented Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-cvsu-green">
            Flashcard Mode
          </p>
          <h1 className="text-2xl font-black text-cvsu-dark">
            {mode === "due" ? "Due reviews" : "Practice deck"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLessonModalOpen(true)}
            className="rounded-full border border-cvsu-green/50 bg-cvsu-light px-3.5 py-1.5 text-xs font-bold text-cvsu-dark transition hover:border-cvsu-dark hover:bg-cvsu-green hover:text-white"
          >
            + From Lesson
          </button>
          <div
            role="tablist"
            aria-label="Flashcard study mode"
            className="inline-flex rounded-full border border-stone-200 bg-white p-1 shadow-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "due"}
              onClick={() => handleModeSwitch("due")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                mode === "due"
                  ? "bg-cvsu-dark text-white shadow-xs"
                  : "text-stone-600 hover:text-cvsu-dark"
              }`}
            >
              Due Reviews ({dueItems.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "practice"}
              onClick={() => handleModeSwitch("practice")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                mode === "practice"
                  ? "bg-cvsu-dark text-white shadow-xs"
                  : "text-stone-600 hover:text-cvsu-dark"
              }`}
            >
              Practice Deck ({practiceItems.length})
            </button>
          </div>
        </div>
      </div>

      {/* Compact Summary Strip */}
      {progress && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/90 bg-white px-4 py-2.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span>
              <span className="font-semibold text-stone-500">Due now </span>
              <span className="font-black text-cvsu-dark">{progress.srs.due_reviews}</span>
            </span>
            <span>
              <span className="font-semibold text-stone-500">Reviewed </span>
              <span className="font-black text-cvsu-dark">{progress.srs.reviewed_items}</span>
            </span>
            <span>
              <span className="font-semibold text-stone-500">Retention </span>
              <span className="font-black text-cvsu-green">{progress.srs.retention_percentage}%</span>
            </span>
            <span>
              <span className="font-semibold text-stone-500">Study streak </span>
              <span className="font-black text-cvsu-dark">{progress.summary.study_streak_days}d</span>
            </span>
          </div>
          {lastScheduled && mode === "due" && (
            <span className="rounded-full bg-cvsu-light px-2.5 py-0.5 text-[11px] font-semibold text-cvsu-dark">
              Next: {new Date(lastScheduled).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Thin Animated Progress Bar + Keyboard Hint */}
      {totalCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-cvsu-dark">
              {index + 1} of {totalCount}
            </span>
            <span className="text-stone-500">
              {mode === "due" ? "Space to flip · 1–4 to rate" : "Space to flip · ←/→ to navigate"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
            <div
              className="h-full rounded-full bg-cvsu-green transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty / Session Complete State */}
      {totalCount === 0 ? (
        <div className="rounded-3xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
          <div className="mx-auto max-w-md space-y-3">
            <span className="inline-flex rounded-full bg-cvsu-light px-3 py-1 text-xs font-bold text-cvsu-dark">
              {mode === "due" ? "Session complete" : "No flashcards yet"}
            </span>
            <h2 className="text-2xl font-black text-cvsu-dark">
              {mode === "due" ? "All caught up!" : "Your practice deck is empty"}
            </h2>
            <p className="text-sm text-stone-600">
              {mode === "due"
                ? "You have reviewed every scheduled card for now. Want to keep sharpening your recall?"
                : "Complete a quiz assessment to populate your spaced-repetition flashcard deck."}
            </p>
            {mode === "due" && practiceItems.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleModeSwitch("practice")}
                  className="rounded-full bg-cvsu-dark px-5 py-2.5 text-sm font-bold text-white transition hover:bg-cvsu-dark/90"
                >
                  Open Practice Deck ({practiceItems.length})
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Tactile 3D Stacked-Deck Flashcard */}
          <div className="relative pt-1 pb-3">
            {/* Stacked-deck depth layers */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-5 top-3 bottom-1 rounded-3xl border border-stone-200/70 bg-stone-100/80"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2.5 top-2 bottom-2 rounded-3xl border border-stone-200/90 bg-white/90 shadow-xs"
            />

            {/* 3D Perspective Stage */}
            <div
              className="relative"
              style={{ perspective: "1000px" }}
              onClick={handleCardSurfaceClick}
            >
              <div
                className="grid cursor-pointer select-none"
                style={{
                  transformStyle: "preserve-3d",
                  transition: "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* Front Face */}
                <article
                  aria-hidden={isFlipped}
                  className={`col-start-1 row-start-1 flex min-h-[290px] flex-col justify-between rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-7 ${
                    isFlipped ? "pointer-events-none" : ""
                  }`}
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-cvsu-light px-3 py-1 text-xs font-bold text-cvsu-dark">
                      {item.topic || "Study item"}
                    </span>
                    <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
                      Interval: {item.interval_days || 0}d
                    </span>
                  </div>

                  <div className="my-6 flex flex-1 items-center justify-center text-center">
                    <h2 className="max-w-xl text-xl font-bold leading-relaxed text-cvsu-dark sm:text-2xl">
                      {item.prompt || item.item_key}
                    </h2>
                  </div>

                  <div className="space-y-3" data-no-flip="true">
                    {showRecallInput && (
                      <textarea
                        value={recall}
                        onChange={(event) => setRecall(event.target.value)}
                        placeholder="Type what you remember before flipping..."
                        className="min-h-20 w-full rounded-2xl border border-stone-200 bg-stone-50/60 p-3 text-sm text-cvsu-dark outline-none focus:border-cvsu-green focus:bg-white"
                        disabled={saving}
                      />
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRecallInput((prev) => !prev)}
                        className="rounded-full border border-stone-200 px-3.5 py-1.5 text-xs font-semibold text-stone-600 transition hover:border-cvsu-green hover:text-cvsu-dark"
                      >
                        {showRecallInput ? "Hide recall note" : "Type recall note"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsFlipped(true)}
                        className="rounded-full bg-cvsu-dark px-5 py-2 text-xs font-bold text-white transition hover:bg-cvsu-dark/90"
                      >
                        Show Answer
                      </button>
                    </div>
                  </div>
                </article>

                {/* Back Face */}
                <article
                  aria-hidden={!isFlipped}
                  className={`col-start-1 row-start-1 flex min-h-[290px] flex-col justify-between overflow-hidden rounded-3xl border border-cvsu-green/35 bg-white shadow-sm ${
                    !isFlipped ? "pointer-events-none" : ""
                  }`}
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div className="flex items-center justify-between border-b border-cvsu-green/20 bg-cvsu-light/85 px-6 py-3.5">
                    <span className="text-xs font-black uppercase tracking-wider text-cvsu-dark">
                      Answer
                    </span>
                    <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-bold text-cvsu-green">
                      {item.topic || "Study item"}
                    </span>
                  </div>

                  <div className="flex-1 space-y-4 p-6 sm:p-7">
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                        Correct answer
                      </p>
                      <p className="text-lg font-bold leading-relaxed text-cvsu-dark">
                        {item.correct_answer || "Answer unavailable until quiz submission is verified."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-stone-200/80 bg-stone-50/70 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                        Explanation
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-stone-700">
                        {item.explanation || "No additional explanation provided for this card."}
                      </p>
                    </div>

                    {recall.trim().length > 0 && (
                      <div className="rounded-2xl border border-cvsu-green/25 bg-cvsu-light/45 p-3.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-cvsu-green">
                          Your recall
                        </p>
                        <p className="mt-1 text-sm text-cvsu-dark">{recall}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end px-6 pb-4" data-no-flip="true">
                    <button
                      type="button"
                      onClick={() => setIsFlipped(false)}
                      className="rounded-full border border-stone-200 px-3.5 py-1.5 text-xs font-semibold text-stone-600 transition hover:border-cvsu-green hover:text-cvsu-dark"
                    >
                      Show Question
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </div>

          {/* Controls Beneath the Card */}
          {mode === "due" ? (
            <div className="min-h-[68px]">
              {isFlipped ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {RATING_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        disabled={saving}
                        onClick={() => void handleReview(option.quality)}
                        className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition disabled:opacity-50 ${option.className}`}
                      >
                        <span className="text-sm font-bold">{option.label}</span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-black ${option.badgeClass}`}
                        >
                          {option.key}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-3 text-center text-xs font-medium text-stone-500">
                  Flip the card to reveal the answer and rate your recall.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-xs">
              <button
                type="button"
                onClick={() => handlePracticeStep(-1)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 transition hover:border-cvsu-green hover:text-cvsu-dark"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setIsFlipped((prev) => !prev)}
                className="rounded-xl bg-cvsu-dark px-5 py-2 text-xs font-bold text-white transition hover:bg-cvsu-dark/90"
              >
                Flip
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShufflePractice}
                  className="rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-bold text-stone-700 transition hover:border-cvsu-green hover:text-cvsu-dark"
                >
                  Shuffle
                </button>
                <button
                  type="button"
                  onClick={() => handlePracticeStep(1)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 transition hover:border-cvsu-green hover:text-cvsu-dark"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-center text-sm font-semibold text-red-600">{error}</p>}
        </>
      )}

      {/* Topic Progress */}
      {progress && progress.topics.length > 0 && (
        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">
            Topic progress
          </h2>
          <div className="space-y-2.5">
            {progress.topics.slice(0, 5).map((topic) => (
              <div key={topic.topic} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate font-semibold text-cvsu-dark">{topic.topic}</span>
                <span className="shrink-0 text-xs font-medium text-stone-500">
                  {topic.average_percentage}% · {topic.mastery}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <LessonFlashcardModal
        open={lessonModalOpen}
        onClose={() => setLessonModalOpen(false)}
        onGenerated={(created) => {
          setDueItems((current) => [...created, ...current]);
          setPracticeItems((current) => [...created, ...current]);
          setMode("due");
          setIndex(0);
          resetCardState();
          void fetchStudentProgress()
            .then((fresh) => setProgress(fresh))
            .catch(() => {});
        }}
      />
    </div>
  );
}
