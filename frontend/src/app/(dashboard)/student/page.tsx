"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import QuizBrowser from "@/components/QuizBrowser";
import { useRouter } from "next/navigation";

export default function StudentPage() {
  const { user, isLoaded } = useAuth();
  const router = useRouter();

  if (!isLoaded || !user) return null;

  return (
    <QuizBrowser
      onSelectQuiz={(id) => router.push(`/quiz/${id}`)}
      onViewGrades={() => router.push("/grades")}
    />
  );
}
