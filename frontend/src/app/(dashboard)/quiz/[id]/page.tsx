"use client";

import { useState } from "react";
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
  const [submitError, setSubmitError] = useState("");

  const { data: quizDetail, isLoading, error } = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => fetchQuizDetail(quizId),
    enabled: !!quizId,
    staleTime: 0,
    refetchOnMount: "always",
  });

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
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const studentName = user?.full_name || user?.name || user?.email.split("@")[0] || "Student";
      const studentEmail = user?.email || "";

      // Server-side evaluation
      const result = await submitQuiz(
        studentName,
        studentEmail,
        quizDetail.id,
        quizDetail.topic,
        0,
        quizDetail.question_count,
        rawAnswers
      );

      setScore(result.score ?? 0);
      setAnswers(result.answers ?? []);
      setView("results");
    } catch (err: unknown) {
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
          questions={quizDetail.questions}
          quizType={quizDetail.quiz_type}
          onComplete={handleQuizComplete}
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
