"use client";

import { useEffect, useState } from "react";
import { PublishedQuiz, QuizType } from "@/types/quiz";
import { fetchQuizzes, joinClassroom } from "@/lib/api";
import { clearDraft, readDraft, writeDraft } from "@/lib/draftRecovery";
import { useAuth } from "@/lib/auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
  IconBarChart,
  IconRefresh,
  IconArrowRight,
  IconList,
  IconToggle,
  IconEdit,
  IconMessage,
  IconSparkles,
  IconAssessmentIllustration,
} from "@/components/icons";

interface Props {
  onSelectQuiz: (quizId: string) => void;
  onViewGrades: () => void;
}

const FORMAT_ICONS: Record<QuizType, React.ReactNode> = {
  "Multiple Choice": <IconList size={14} className="text-cvsu-green" />,
  "True or False": <IconToggle size={14} className="text-cvsu-green" />,
  "Identification": <IconEdit size={14} className="text-cvsu-green" />,
  "Open Ended": <IconMessage size={14} className="text-cvsu-green" />,
  "Mixed Assessment": <IconSparkles size={14} className="text-cvsu-green" />,
};

export default function QuizBrowser({ onSelectQuiz, onViewGrades }: Props) {
  const { user } = useAuth();
  const joinDraftKey = `quiz-hero:draft:join-class:${user?.email?.toLowerCase() || "anonymous"}`;
  const { data: quizzes = [], isLoading, refetch } = useQuery({
    queryKey: ["quizzes"],
    queryFn: fetchQuizzes,
  });
  const [inviteCode, setInviteCode] = useState(() => readDraft<string>(joinDraftKey) || "");
  const [joinMessage, setJoinMessage] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (inviteCode) writeDraft(joinDraftKey, inviteCode);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [inviteCode, joinDraftKey]);

  const loadQuizzes = () => {
    refetch();
  };

  return (
    <div className="view-transition space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 pb-7 border-b border-stone-200">
        <div>
          <p className="text-sm font-semibold text-cvsu-green mb-2">Your learning space</p>
          <h2 className="font-syne text-2xl sm:text-3xl tracking-tight text-[#1C1C1C]">Ready for your next check-in?</h2>
          <p className="text-sm text-stone-600 mt-2 max-w-xl leading-relaxed">
            Choose an assessment below. Work at your own pace and use the review afterward to see what to revisit.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadQuizzes}
            disabled={isLoading}
            className="px-4 py-2 bg-[#F7F7F2] hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs btn-tactile hover:-translate-y-0.5 cursor-pointer"
          >
            <IconRefresh size={14} className={isLoading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onViewGrades}
            className="px-5 py-2 bg-cvsu-dark hover:bg-cvsu-green text-white rounded-full text-xs font-bold transition-all flex items-center gap-2 shadow-md btn-tactile hover:-translate-y-0.5 cursor-pointer border border-cvsu-green/30"
          >
            <IconBarChart size={14} className="text-cvsu-vibrant" />
            <span>See my progress</span>
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-cvsu-green/20 bg-cvsu-light/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-cvsu-green">Join a class</p>
            <p className="mt-1 text-xs text-stone-600">Enter your instructor&apos;s invite code to access assigned assessments.</p>
          </div>
          <div className="flex gap-2">
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Invite code" maxLength={8} className="w-32 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-mono uppercase text-[#1C1C1C]" />
            <button type="button" disabled={joining || !inviteCode.trim()} onClick={async () => {
              setJoining(true);
              setJoinMessage("");
              try {
                const classroom = await joinClassroom(inviteCode);
                setJoinMessage(`Joined ${classroom.name}.`);
                setInviteCode("");
                clearDraft(joinDraftKey);
                refetch();
              } catch (error) {
                setJoinMessage(error instanceof Error ? error.message : "Unable to join class.");
              } finally {
                setJoining(false);
              }
            }} className="rounded-full bg-cvsu-green px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {joining ? "Joining..." : "Join"}
            </button>
          </div>
        </div>
        {joinMessage && <p className="mt-2 text-xs font-semibold text-cvsu-green" role="status">{joinMessage}</p>}
      </section>

      {/* List / Skeletons / Illustrated Empty State */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 w-full rounded-3xl" />
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <div className="p-12 text-center bg-[#F7F7F2]/60 border border-dashed border-stone-300 rounded-2xl space-y-3 view-transition">
          <div className="flex justify-center">
            <IconAssessmentIllustration size={80} className="drop-shadow-xs hover:scale-105 transition-transform" />
          </div>
          <h3 className="font-syne text-base text-[#1C1C1C]">Nothing is waiting for you yet</h3>
          <p className="text-sm text-stone-600 max-w-sm mx-auto leading-relaxed">
            Your instructor has not published an assessment. You can check again later.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={loadQuizzes}
              className="px-5 py-2.5 bg-white hover:bg-[#F7F7F2] border border-stone-300 text-xs font-bold text-cvsu-green rounded-full transition-all inline-flex items-center gap-2 shadow-xs btn-tactile hover:-translate-y-0.5 cursor-pointer"
            >
              <IconRefresh size={13} />
              <span>Check again</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {quizzes.map((quiz) => (
            <button
              key={quiz.id}
              type="button"
              onClick={() => onSelectQuiz(quiz.id)}
              className="w-full text-left p-5 sm:p-6 bg-white hover:bg-[#F7F7F2]/60 border border-stone-200 hover:border-cvsu-green rounded-2xl transition-all duration-200 flex items-center justify-between gap-4 group cursor-pointer shadow-sm hover:shadow-md"
            >
              <div className="min-w-0 flex-1 space-y-2.5">
                <p className="text-base sm:text-lg font-semibold text-[#1C1C1C] group-hover:text-cvsu-green transition-colors truncate tracking-tight">
                  {quiz.topic}
                </p>
                
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cvsu-light text-cvsu-green font-bold border border-cvsu-green/30">
                    {FORMAT_ICONS[quiz.quiz_type]}
                    <span>{quiz.quiz_type}</span>
                  </span>
                  
                  <span className="text-stone-500 font-medium font-mono text-xs">
                    {quiz.question_count} questions
                  </span>
                  {quiz.course_code && (
                    <span className="text-stone-500 font-medium">{quiz.course_code}</span>
                  )}
                  {quiz.class_section && (
                    <span className="text-stone-500 font-medium">Section {quiz.class_section}</span>
                  )}
                  {quiz.due_at && (
                    <span className="text-amber-700 font-semibold">
                      Due {new Date(quiz.due_at).toLocaleString()}
                    </span>
                  )}

                  {quiz.created_by_email && (
                    <span className="text-stone-400 font-mono text-[11px] hidden sm:inline">
                      • Instructor: {quiz.created_by_email}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Arrow Box with Spring Glide */}
              <div className="w-12 h-12 rounded-2xl bg-[#F7F7F2] group-hover:bg-cvsu-dark group-hover:text-white border border-stone-200 group-hover:border-cvsu-dark flex items-center justify-center text-stone-400 transition-all duration-200 shrink-0 shadow-xs group-hover:shadow-sm">
                <IconArrowRight size={18} className="group-hover:translate-x-1 transition-transform duration-200 ease-out" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
