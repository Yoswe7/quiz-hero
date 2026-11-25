"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchQuizAnswers, fetchQuizDetail, submitQuiz } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import QuizPlayer, { StudentQuizAnswerInput } from "@/features/quiz-player/components/QuizPlayer";
import ResultsScreen from "@/features/quiz-player/components/ResultsScreen";
import TeacherQuizPreview from "@/features/assessment-engine/components/TeacherQuizPreview";
import { AnswerDetail } from "@/types/quiz";

export default function QuizPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const quizId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const isTeacher = user?.role?.toUpperCase() === "TEACHER" || user?.role?.toLowerCase() === "teacher";
  const isTeacherPreview = isTeacher && searchParams.get("preview") === "teacher";

  const [view, setView] = useState<"quiz" | "results">("quiz");
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<AnswerDetail[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasSubmittedRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const { data: quizDetail, isLoading, error } = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => fetchQuizDetail(quizId),
    enabled: !!quizId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!quizDetail?.due_at) return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [quizDetail?.due_at]);

  const { data: answerData, isLoading: isLoadingAnswers, error: answersError } = useQuery({
    queryKey: ["quiz-answers", quizId],
    queryFn: () => fetchQuizAnswers(quizId),
    enabled: !!quizId && isTeacherPreview,
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading || (isTeacherPreview && isLoadingAnswers)) {
    return <div className="p-8 text-center text-cvsu-green animate-pulse font-medium">Loading Assessment...</div>;
  }
  if (error || !quizDetail) return <div className="p-8 text-center text-red-500 font-medium">Failed to load assessment.</div>;

  const isStudent = user?.role?.toUpperCase() === "STUDENT";
  const isPastDue =
    isStudent &&
    !isTeacherPreview &&
    !!quizDetail.due_at &&
    new Date(quizDetail.due_at).getTime() < nowMs;
  if (isPastDue) {
    return (
      <div className="p-8 text-center text-red-600 font-medium">
        This assessment is past its due date and is no longer available.
      </div>
    );
  }
  if (isStudent && !isTeacherPreview && quizDetail.retake_locked) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-5">
        <div className="rounded-3xl border border-stone-200 bg-[#F7F7F2] p-6 space-y-2">
          <span className="inline-block rounded-full border border-stone-300 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-stone-700">
            Assessment Locked
          </span>
          <h2 className="font-syne text-xl text-[#1C1C1C]">{quizDetail.topic}</h2>
          <p className="text-sm text-stone-600 font-medium">
            {quizDetail.lock_reason || "You have already submitted this assessment and retakes are not enabled."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/grades")}
            className="px-5 py-2.5 rounded-full bg-cvsu-green hover:bg-cvsu-dark text-white text-xs font-bold transition-colors cursor-pointer"
          >
            View My Progress
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="px-5 py-2.5 rounded-full border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  if (isTeacherPreview) {
    if (answersError || !answerData) {
      return <div className="p-8 text-center text-red-500 font-medium">Failed to load the answer key.</div>;
    }
    return (
      <TeacherQuizPreview
        topic={answerData.topic || quizDetail.topic}
        questions={answerData.questions}
        quizType={answerData.quiz_type || quizDetail.quiz_type}
      />
    );
  }

  const handleQuizComplete = async (rawAnswers: StudentQuizAnswerInput[]) => {
    if (!quizDetail) return;
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setIsSubmitting(true);
    setSubmitError("");

    try {
      // Server-side evaluation
      const result = await submitQuiz(
        quizDetail.id,
        quizDetail.topic,
        quizDetail.question_count,
        rawAnswers
      );

      setScore(result.score ?? 0);
      setAnswers(result.answers ?? []);
      setView("results");
    } catch (err: unknown) {
      hasSubmittedRef.current = false;
      const msg = err instanceof Error ? err.message : "Failed to submit assessment evaluation.";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnToDashboard = () => {
    router.push(isTeacher ? "/studio" : "/dashboard");
  };

  return (
    <div className="view-transition">
      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-semibold">
          {submitError}
        </div>
      )}

      {isSubmitting ? (
        <div className="py-20 text-center space-y-4">
          <div className="w-10 h-10 border-3 border-cvsu-green/20 border-t-cvsu-green rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-stone-700">Evaluating responses on server...</p>
        </div>
      ) : view === "quiz" ? (
        <QuizPlayer
          quizId={quizDetail.id}
          studentEmail={user?.email || ""}
          questions={quizDetail.questions}
          quizType={quizDetail.quiz_type}
          onComplete={handleQuizComplete}
          questionTimeLimitSeconds={quizDetail.question_time_limit_seconds ?? null}
        />
      ) : (
        <ResultsScreen
          topic={quizDetail.topic}
          score={score}
          totalQuestions={quizDetail.question_count}
          answers={answers}
          onSubmitAndContinue={handleReturnToDashboard}
        />
      )}
    </div>
  );
}
