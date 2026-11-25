"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { StudentQuestion, QuizType } from "@/types/quiz";
import { IconArrowRight } from "@/components/icons";
import { clearDraft, readDraft, writeDraft } from "@/lib/draftRecovery";

export interface StudentQuizAnswerInput {
  question: string;
  user_answer: string;
}

interface Props {
  quizId: string;
  studentEmail: string;
  questions: StudentQuestion[];
  quizType: QuizType;
  onComplete: (answers: StudentQuizAnswerInput[]) => void;
  questionTimeLimitSeconds?: number | null;
}

interface QuizDraft {
  currentIndex: number;
  textInput: string;
  recordedAnswers: StudentQuizAnswerInput[];
}

interface TimerSnapshot {
  index: number;
  limitSeconds: number;
  remainingMs: number;
}

function resolveRestoredDraft(
  draft: QuizDraft | null,
  questionCount: number
): { initialIndex: number; initialAnswers: StudentQuizAnswerInput[]; initialText: string } {
  if (!draft || questionCount <= 0) {
    return { initialIndex: 0, initialAnswers: [], initialText: "" };
  }
  const rawAnswers = Array.isArray(draft.recordedAnswers) ? draft.recordedAnswers : [];
  const maxIndex = Math.max(questionCount - 1, 0);
  // Keep recordedAnswers.length === currentIndex so restored drafts never lock the active question.
  const safeIndex = Math.min(Math.max(draft.currentIndex ?? 0, 0), rawAnswers.length, maxIndex);
  return {
    initialIndex: safeIndex,
    initialAnswers: rawAnswers.slice(0, safeIndex),
    initialText: typeof draft.textInput === "string" ? draft.textInput : "",
  };
}

export default function QuizPlayer({ quizId, studentEmail, questions, quizType, onComplete, questionTimeLimitSeconds = null }: Props) {
  const draftKey = `quiz-hero:draft:quiz:${studentEmail.toLowerCase()}:${quizId}`;
  const [restoredState] = useState(() => {
    const rawDraft = readDraft<QuizDraft>(draftKey);
    return {
      hasDraft: Boolean(rawDraft),
      ...resolveRestoredDraft(rawDraft, questions.length),
    };
  });
  const [currentIndex, setCurrentIndex] = useState(restoredState.initialIndex);
  const [textInput, setTextInput] = useState(restoredState.initialText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordedAnswers, setRecordedAnswers] = useState<StudentQuizAnswerInput[]>(
    restoredState.initialAnswers
  );
  const [showRestoredDraft, setShowRestoredDraft] = useState(restoredState.hasDraft);
  const [timerSnapshot, setTimerSnapshot] = useState<TimerSnapshot | null>(() =>
    questionTimeLimitSeconds
      ? {
          index: restoredState.initialIndex,
          limitSeconds: questionTimeLimitSeconds,
          remainingMs: questionTimeLimitSeconds * 1000,
        }
      : null
  );
  const hasCompletedRef = useRef(false);
  const hasTimedOutRef = useRef(false);
  const recordedAnswersRef = useRef(recordedAnswers);
  const textInputRef = useRef(textInput);
  const answerInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const handleTimeUpRef = useRef<() => void>(() => {});

  const question = questions[currentIndex];
  const itemQuizType = question?.quiz_type || quizType;
  const isTextInput = itemQuizType === "Identification" || itemQuizType === "Open Ended";
  const progressPercent = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const remainingMs = !questionTimeLimitSeconds
    ? null
    : timerSnapshot &&
        timerSnapshot.index === currentIndex &&
        timerSnapshot.limitSeconds === questionTimeLimitSeconds
      ? timerSnapshot.remainingMs
      : questionTimeLimitSeconds * 1000;

  const isTimedOut = remainingMs !== null && remainingMs <= 0;
  const isAnswerLocked = isSubmitting || Boolean(questionTimeLimitSeconds && isTimedOut);

  const formatTimer = (ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  useEffect(() => {
    recordedAnswersRef.current = recordedAnswers;
  }, [recordedAnswers]);

  useEffect(() => {
    if (!question || hasCompletedRef.current) return;
    const timeout = window.setTimeout(() => {
      writeDraft(draftKey, { currentIndex, textInput, recordedAnswers });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [currentIndex, draftKey, question, recordedAnswers, textInput]);

  // Advance to the next question (or finish) when the per-question timer expires.
  // Auto-submits any trimmed text typed so far (or a blank string if empty) so
  // submitted answers stay index-aligned with the server's question order.
  const handleTimeUp = useCallback(() => {
    if (hasCompletedRef.current) return;
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const recorded = recordedAnswersRef.current;
    // A click already answered this question (won the race) — do nothing.
    if (recorded.length > currentIndex) return;

    const currentType = currentQuestion.quiz_type || quizType;
    const currentIsText = currentType === "Identification" || currentType === "Open Ended";
    const timedOutAnswer = currentIsText ? textInputRef.current.trim() : "";

    const updated = [...recorded, { question: currentQuestion.question, user_answer: timedOutAnswer }];
    recordedAnswersRef.current = updated;
    setRecordedAnswers(updated);
    textInputRef.current = "";
    setTextInput("");

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      hasCompletedRef.current = true;
      setIsSubmitting(true);
      clearDraft(draftKey);
      onComplete(updated);
    }
  }, [currentIndex, questions, quizType, draftKey, onComplete]);

  // Keep the timer's expiry handler fresh without restarting the countdown
  // when the parent re-renders with a new onComplete identity.
  useEffect(() => {
    handleTimeUpRef.current = handleTimeUp;
  });

  // Per-question countdown: resets on every question, auto-advances on expiry.
  useEffect(() => {
    if (!questionTimeLimitSeconds || hasCompletedRef.current || !question) return;
    hasTimedOutRef.current = false;
    const deadline = Date.now() + questionTimeLimitSeconds * 1000;
    const interval = window.setInterval(() => {
      if (hasCompletedRef.current) return;
      const remaining = Math.max(0, deadline - Date.now());
      setTimerSnapshot({
        index: currentIndex,
        limitSeconds: questionTimeLimitSeconds,
        remainingMs: remaining,
      });
      if (remaining <= 0 && !hasTimedOutRef.current) {
        window.clearInterval(interval);
        hasTimedOutRef.current = true;
        handleTimeUpRef.current();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [currentIndex, questionTimeLimitSeconds, question]);

  const processAnswer = useCallback(
    (userAnswer: string) => {
      if (isAnswerLocked || hasCompletedRef.current || !question) return;
      const cleanAnswer = userAnswer.trim();
      if (!cleanAnswer) return;

      // The per-question timer already expired for this question — the answer
      // was recorded and the quiz advanced; ignore the late click.
      if (recordedAnswersRef.current.length > currentIndex) return;

      const currentRecord: StudentQuizAnswerInput = {
        question: question.question,
        user_answer: cleanAnswer,
      };

      const updated = [...recordedAnswersRef.current, currentRecord];
      recordedAnswersRef.current = updated;
      setRecordedAnswers(updated);
      textInputRef.current = "";
      setTextInput("");

      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((prev) => prev + 1);
      } else if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        setIsSubmitting(true);
        clearDraft(draftKey);
        onComplete(updated);
      }
    },
    [isAnswerLocked, currentIndex, question, questions.length, onComplete, draftKey]
  );

  // Keyboard shortcut listener for Multiple Choice / True or False (Keys 1-4 or A-D)
  useEffect(() => {
    if (!question || isTextInput || isAnswerLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const key = e.key.toUpperCase();
      let selectedIdx = -1;

      if (key >= "A" && key <= "D") {
        selectedIdx = key.charCodeAt(0) - 65;
      } else if (key >= "1" && key <= "4") {
        selectedIdx = parseInt(key, 10) - 1;
      }

      if (selectedIdx >= 0 && selectedIdx < question.options.length) {
        e.preventDefault();
        e.stopPropagation();
        processAnswer(question.options[selectedIdx]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTextInput, isAnswerLocked, question, processAnswer]);

  // Delay programmatic focus slightly so MCQ shortcut keystrokes cannot bleed into a newly mounted input
  useEffect(() => {
    if (!isTextInput || isAnswerLocked) return;
    const focusTimer = window.setTimeout(() => {
      answerInputRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(focusTimer);
  }, [currentIndex, isTextInput, isAnswerLocked]);

  if (!question) {
    return (
      <div className="p-8 text-center text-stone-600 text-sm font-medium">
        No questions are available in this assessment.
      </div>
    );
  }

  return (
    <div className="view-transition space-y-9">
      {showRestoredDraft && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-cvsu-green/30 bg-cvsu-light px-4 py-3 text-xs font-semibold text-cvsu-green" role="status">
          <span>Your previous session was restored.</span>
          <button type="button" onClick={() => setShowRestoredDraft(false)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}
      {/* Per-Question Timer */}
      {questionTimeLimitSeconds && remainingMs !== null && (
        <div className={`rounded-2xl border px-4 py-3 font-mono font-bold text-sm transition-colors ${
          isTimedOut
            ? "border-red-300 bg-red-50 text-red-700"
            : remainingMs <= 10000
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-stone-200 bg-white text-stone-700"
        }`}>
          <span className="text-xs font-bold text-stone-500">Question Timer · {questionTimeLimitSeconds}s per question</span>
          <div className="text-xl">{formatTimer(remainingMs)}</div>
        </div>
      )}

      {/* Header & Linear Progress */}
      <div className="space-y-3.5 pb-5 border-b border-stone-200">
        <div className="flex justify-between items-center text-sm font-semibold text-stone-600">
          <div className="flex items-center gap-2.5">
            <span>Question {currentIndex + 1} of {questions.length}</span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-cvsu-light text-cvsu-green border border-cvsu-green/30 font-medium">
              {question.section_name || itemQuizType}
            </span>
          </div>
          <span className="text-xs font-medium text-stone-500">
            {Math.round(progressPercent)}% done
          </span>
        </div>
        
        {/* Animated Linear Progress Bar */}
        <div className="w-full bg-stone-200 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-cvsu-green h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Dynamic Animated Question Slide Container */}
      <div key={currentIndex} className="question-transition space-y-6">
        
        {/* Question Prompt */}
        <div className="py-2">
          {question.section_name && (
            <p className="text-xs font-bold uppercase tracking-wider text-cvsu-green mb-1">
              {question.section_name}
            </p>
          )}
          <h2 className="text-xl sm:text-2xl font-semibold text-[#1C1C1C] leading-relaxed tracking-tight max-w-3xl">
            {question.question}
          </h2>
        </div>

        {/* Multiple Choice / True or False Options */}
        {!isTextInput && (
          <div className="space-y-3">
            {question.options.map((option, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => processAnswer(option)}
                disabled={isAnswerLocked}
                className="w-full text-left p-5 rounded-xl border border-stone-200 bg-white hover:border-cvsu-green hover:bg-cvsu-light/50 text-[#1C1C1C] hover:text-cvsu-green transition-all duration-150 text-sm sm:text-base flex items-center justify-between gap-4 shadow-xs hover:shadow-md group btn-tactile disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <span className="w-8 h-8 rounded-md font-semibold text-sm flex items-center justify-center shrink-0 bg-[#F7F7F2] group-hover:bg-cvsu-green group-hover:text-white text-stone-700 transition-colors border border-stone-200 group-hover:border-cvsu-green">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="font-medium group-hover:font-semibold transition-all">{option}</span>
                </div>

                <div className="w-7 h-7 rounded-xl flex items-center justify-center text-stone-300 group-hover:text-cvsu-green transition-colors">
                  <IconArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-150" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Direct Input (Identification / Open Ended) */}
        {isTextInput && (
          <div className="space-y-4">
            {itemQuizType === "Open Ended" ? (
              <textarea
                ref={(el) => {
                  answerInputRef.current = el;
                }}
                placeholder="Provide a comprehensive academic explanation based on course concepts..."
                className="w-full p-5 bg-white border border-stone-300 rounded-2xl text-sm text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green min-h-[150px] resize-y shadow-xs leading-relaxed"
                value={textInput}
                onChange={(e) => {
                  textInputRef.current = e.target.value;
                  setTextInput(e.target.value);
                }}
                disabled={isAnswerLocked}
              />
            ) : (
              <input
                ref={(el) => {
                  answerInputRef.current = el;
                }}
                type="text"
                placeholder="Type your answer term..."
                className="w-full px-5 py-4 bg-white border border-stone-300 rounded-2xl text-sm text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green shadow-xs"
                value={textInput}
                onChange={(e) => {
                  textInputRef.current = e.target.value;
                  setTextInput(e.target.value);
                }}
                disabled={isAnswerLocked}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && textInput.trim()) {
                    processAnswer(textInput.trim());
                  }
                }}
              />
            )}

            <button
              type="button"
              onClick={() => textInput.trim() && processAnswer(textInput.trim())}
              disabled={!textInput.trim() || isAnswerLocked}
              className="w-full bg-cvsu-green hover:bg-cvsu-dark text-white font-extrabold py-4 px-8 rounded-full text-sm sm:text-base transition-all shadow-lg hover:shadow-xl btn-tactile hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer border border-cvsu-vibrant/30"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting to Server for Evaluation...</span>
                </>
              ) : (
                <>
                  <span>Submit & Next Question</span>
                  <IconArrowRight size={16} className="text-cvsu-vibrant" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Keyboard Hint Footer */}
        {!isTextInput && (
          <div className="pt-2 flex justify-between items-center text-[11px] text-stone-400 font-medium">
            <span>Tip: Press <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">A</kbd> - <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">D</kbd> or <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">1</kbd> - <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">4</kbd></span>
            <span className="text-cvsu-green font-bold font-mono">Instant Fast Advance</span>
          </div>
        )}
      </div>
    </div>
  );
}
