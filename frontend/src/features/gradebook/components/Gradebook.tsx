"use client";

import { useState } from "react";
import { GradeSubmission } from "@/types/quiz";
import { fetchGrades, fetchStudentProgress, StudentProgress } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  IconArrowLeft,
  IconRefresh,
  IconBarChart,
  IconCheckCircle,
  IconXCircle,
} from "@/components/icons";

interface Props {
  role: "teacher" | "student";
  studentName?: string;
  studentEmail?: string;
  onBack: () => void;
}

export default function Gradebook({ role, studentName, studentEmail, onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<GradeSubmission | null>(null);

  const { data: grades = [], isLoading, refetch } = useQuery({
    queryKey: ["grades", role, studentEmail],
    queryFn: () => fetchGrades(),
  });
  const { data: progress, isLoading: isProgressLoading, error: progressError } = useQuery<StudentProgress>({
    queryKey: ["student-progress", studentEmail],
    queryFn: fetchStudentProgress,
    enabled: role === "student",
  });

  const filteredGrades = grades.filter((g) => {
    const q = searchQuery.toLowerCase();
    return (
      g.topic.toLowerCase().includes(q) ||
      g.student_name.toLowerCase().includes(q) ||
      (g.student_email && g.student_email.toLowerCase().includes(q))
    );
  });

  const exportToCSV = () => {
    if (grades.length === 0) return;

    const sanitizeField = (val: string) => `"${val.replace(/[\r\n]+/g, " ").replace(/"/g, '""').trim()}"`;

    const headers = ["Student Name", "Student Email", "Assessment Topic", "Score", "Total Questions", "Percentage (%)", "Date"];
    const rows = grades.map((g) => [
      sanitizeField(g.student_name || "Student"),
      sanitizeField(g.student_email || ""),
      sanitizeField(g.topic || "Assessment"),
      g.score,
      g.total_questions,
      g.percentage,
      sanitizeField(g.created_at || new Date().toISOString()),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `CvSU_Imus_Gradebook_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view-transition space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-xs font-bold text-stone-500 hover:text-cvsu-green transition-colors flex items-center gap-1.5 group cursor-pointer"
          >
            <IconArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            <span>Return to Dashboard</span>
          </button>
          <h2 className="text-2xl font-black tracking-tight text-[#1C1C1C]">
            {role === "teacher" ? "Institutional Gradebook" : "Academic Assessment Record"}
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            {role === "teacher"
              ? "All recorded student submissions across active curriculum assessments"
              : `Logged submissions for ${studentEmail || studentName}`}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {role === "teacher" && grades.length > 0 && (
            <button
              type="button"
              onClick={exportToCSV}
              className="px-5 py-2.5 bg-cvsu-green hover:bg-cvsu-dark text-white font-extrabold rounded-full text-xs transition-all shadow-md hover:shadow-lg btn-tactile hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer border border-cvsu-vibrant/30"
            >
              <span>Export CSV</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-4 py-2 bg-[#F7F7F2] hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs btn-tactile hover:-translate-y-0.5 cursor-pointer"
          >
            <IconRefresh size={14} className={isLoading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search Filter */}
      {role === "student" && (
        <StudentProgressPanel
          progress={progress}
          isLoading={isProgressLoading}
          error={progressError}
        />
      )}

      {grades.length > 0 && (
        <div>
          <input
            type="text"
            placeholder={role === "teacher" ? "Filter by student name, email, or topic..." : "Filter by topic..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-5 py-3.5 bg-white border border-stone-300 rounded-2xl text-xs text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green transition-all shadow-xs"
          />
        </div>
      )}

      {/* Table / Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredGrades.length === 0 ? (
        <div className="p-12 text-center bg-[#F7F7F2]/60 border border-dashed border-stone-300 rounded-3xl space-y-2 view-transition">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white text-cvsu-green shadow-xs mb-2">
            <IconBarChart size={24} />
          </div>
          <p className="text-sm font-bold text-[#1C1C1C]">
            {searchQuery ? "No matching records found" : "No Submissions Recorded"}
          </p>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            {role === "teacher"
              ? "Completed assessments from enrolled students will appear here in real-time."
              : "Complete an assessment from the portal to view your permanent score record."}
          </p>
        </div>
      ) : role === "teacher" ? (
        <div className="border border-stone-200 rounded-3xl overflow-hidden shadow-xs bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-cvsu-green text-white font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-4 px-5">Student</th>
                  <th className="py-4 px-5">Institutional Email</th>
                  <th className="py-4 px-5">Topic</th>
                  <th className="py-4 px-5 text-center">Score</th>
                  <th className="py-4 px-5 text-right">Rating</th>
                  <th className="py-4 px-5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800">
                {filteredGrades.map((g, idx) => (
                  <tr key={idx} className="hover:bg-[#F7F7F2] transition-colors group">
                    <td className="py-3.5 px-5 font-bold text-[#1C1C1C] group-hover:text-cvsu-green transition-colors">{g.student_name}</td>
                    <td className="py-3.5 px-5 font-mono text-stone-500 text-[11px]">
                      {g.student_email || "—"}
                    </td>
                    <td className="py-3.5 px-5 text-stone-700 max-w-xs truncate font-medium">{g.topic}</td>
                    <td className="py-3.5 px-5 text-center font-mono font-bold text-[#1C1C1C]">
                      {g.score} / {g.total_questions}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <span
                        className={`inline-block font-mono font-bold px-3 py-1 rounded-full border text-[11px] ${
                          g.percentage >= 75
                            ? "bg-cvsu-light text-cvsu-green border-cvsu-green/30"
                            : g.percentage >= 50
                            ? "bg-amber-50 text-amber-900 border-amber-200"
                            : "bg-red-50 text-red-900 border-red-200"
                        }`}
                      >
                        {g.percentage}%
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmission(g)}
                        className="px-3.5 py-1.5 bg-[#F7F7F2] hover:bg-cvsu-green hover:text-cvsu-vibrant text-stone-700 font-bold rounded-full text-[11px] transition-all btn-tactile shadow-xs cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGrades.map((g, idx) => (
            <div
              key={idx}
              className="p-5 bg-white border border-stone-200 rounded-3xl flex items-center justify-between gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
            >
              <div className="space-y-1">
                <p className="text-base font-bold text-[#1C1C1C] group-hover:text-cvsu-green transition-colors">{g.topic}</p>
                <p className="text-xs text-stone-500">
                  Score: <span className="font-mono font-bold text-[#1C1C1C]">{g.score}</span> of{" "}
                  <span className="font-mono">{g.total_questions}</span> points
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`font-mono font-bold text-sm px-3 py-1 rounded-full border ${
                    g.percentage >= 75
                      ? "bg-cvsu-light text-cvsu-green border-cvsu-green/30"
                      : g.percentage >= 50
                      ? "bg-amber-50 text-amber-900 border-amber-200"
                      : "bg-red-50 text-red-900 border-red-200"
                  }`}
                >
                  {g.percentage}%
                </span>
                
                {g.answers && g.answers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSubmission(g)}
                    className="px-4 py-2 bg-[#F7F7F2] hover:bg-stone-200 text-[#1C1C1C] text-xs font-bold rounded-full transition-all btn-tactile hover:-translate-y-0.5 shadow-xs cursor-pointer"
                  >
                    View Details
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submission Deep-Dive Inspection Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs modal-backdrop-anim">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-[#1C1C1C] modal-box-anim">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-start bg-cvsu-dark text-white">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedSubmission.topic}</h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Student: <span className="font-bold text-cvsu-vibrant">{selectedSubmission.student_name}</span>
                  {selectedSubmission.student_email && ` (${selectedSubmission.student_email})`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold px-3 py-1 rounded-full bg-cvsu-vibrant text-cvsu-dark">
                  {selectedSubmission.score}/{selectedSubmission.total_questions} ({selectedSubmission.percentage}%)
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center text-xs btn-tactile cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Answer-by-Answer Review */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-[#F7F7F2]/40">
              {!selectedSubmission.answers || selectedSubmission.answers.length === 0 ? (
                <p className="text-xs text-stone-500 text-center py-6">No itemized answer breakdown recorded for this submission.</p>
              ) : (
                selectedSubmission.answers.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-5 rounded-2xl border text-xs space-y-2 transition-all ${
                      item.is_correct ? "bg-white border-stone-200" : "bg-red-50/50 border-red-200"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 font-bold text-[#1C1C1C]">
                      {item.is_correct ? (
                        <IconCheckCircle size={18} className="text-cvsu-green shrink-0 mt-0.5" />
                      ) : (
                        <IconXCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                      )}
                      <span>{idx + 1}. {item.question}</span>
                    </div>

                    <div className="pl-6 space-y-1">
                      <p className="text-stone-600">
                        Submitted Answer: <span className="font-bold text-[#1C1C1C]">{item.user_answer || "—"}</span>
                      </p>
                      {!item.is_correct && (
                        <p className="text-cvsu-green font-semibold">
                          Correct Model Answer: <span className="font-bold">{item.correct_answer}</span>
                        </p>
                      )}
                      {item.ai_feedback && (
                        <p className="text-stone-500 italic pt-1 border-t border-stone-200">
                          Evaluation Note: {item.ai_feedback}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 bg-white border-t border-stone-200 text-right">
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="px-6 py-2.5 bg-cvsu-green hover:bg-cvsu-dark text-white text-xs font-bold rounded-full btn-tactile hover:-translate-y-0.5 cursor-pointer shadow-md"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentProgressPanel({
  progress,
  isLoading,
  error,
}: {
  progress?: StudentProgress;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) {
    return <div className="grid gap-3 sm:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-24 rounded-2xl" />)}</div>;
  }
  if (error || !progress) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">Progress could not be loaded. Your assessment records are still available below.</div>;
  }

  const cards = [
    ["Average score", `${progress.summary.average_percentage}%`],
    ["Assessments completed", progress.summary.assessments_completed],
    ["Study streak", `${progress.summary.study_streak_days} days`],
    ["Due reviews", progress.srs.due_reviews],
  ];

  return (
    <section className="space-y-5" aria-labelledby="progress-heading">
      <div>
        <p className="text-sm font-semibold text-cvsu-green">Your learning progress</p>
        <h3 id="progress-heading" className="text-xl font-bold text-[#1C1C1C]">Know what to revisit next</h3>
        <p className="mt-1 text-xs text-stone-500">Scores show assessment performance; retention grows as you complete review sessions.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-[#F7F7F2] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-cvsu-green">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h4 className="text-sm font-bold text-[#1C1C1C]">Topic-level mastery</h4>
          {progress.topics.length === 0 ? (
            <p className="mt-3 text-xs text-stone-500">Complete an assessment to start tracking topic progress.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {progress.topics.map((topic) => (
                <div key={topic.topic}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-semibold text-stone-800">{topic.topic}</span>
                    <span className="shrink-0 font-mono font-bold text-cvsu-green">{topic.average_percentage}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-cvsu-green" style={{ width: `${Math.min(topic.average_percentage, 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">{topic.mastery} · {topic.attempts} attempt{topic.attempts === 1 ? "" : "s"} · best {topic.best_percentage}%</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <h4 className="text-sm font-bold text-amber-950">Recommended topics</h4>
          {progress.recommendations.length === 0 ? (
            <p className="mt-3 text-xs text-amber-900">No topics need extra attention yet. Keep practicing to maintain your progress.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {progress.recommendations.map((recommendation) => (
                <li key={recommendation.topic} className="text-xs text-amber-950">
                  <p className="font-bold">{recommendation.topic}</p>
                  <p className="mt-0.5 text-amber-900/80">{recommendation.reason}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 border-t border-amber-200 pt-4 text-xs text-amber-950">
            <span className="font-bold">{progress.srs.retention_percentage}% retention</span>
            <span className="text-amber-900/70"> · {progress.srs.reviewed_items}/{progress.srs.total_items} review items practiced</span>
          </div>
        </div>
      </div>
    </section>
  );
}
