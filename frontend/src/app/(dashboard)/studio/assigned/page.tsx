"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { createClassroom, fetchClassrooms, fetchFacultyAssignedAssessments } from "@/lib/api";
import { IconRefresh } from "@/components/icons";
import { clearDraft, readDraft, writeDraft } from "@/lib/draftRecovery";

export default function AssignedAssessmentsPage() {
  const { user, isLoaded } = useAuth();
  const draftKey = `quiz-hero:draft:class:${user?.email?.toLowerCase() || "anonymous"}`;
  const [savedDraft] = useState<{ className: string; courseCode: string; classSection: string } | null>(
    () => readDraft(draftKey)
  );
  const { data: assessments = [], isLoading, refetch } = useQuery({
    queryKey: ["faculty-assigned-assessments"],
    queryFn: fetchFacultyAssignedAssessments,
    enabled: isLoaded && user?.role?.toLowerCase() === "teacher",
  });
  const { data: classrooms = [], refetch: refetchClassrooms } = useQuery({
    queryKey: ["classrooms", "teacher"],
    queryFn: fetchClassrooms,
  });
  const [className, setClassName] = useState(savedDraft?.className || "");
  const [courseCode, setCourseCode] = useState(savedDraft?.courseCode || "");
  const [classSection, setClassSection] = useState(savedDraft?.classSection || "");
  const [classError, setClassError] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);
  const [showDraftNotice, setShowDraftNotice] = useState(Boolean(savedDraft));

  useEffect(() => {
    if (!className && !courseCode && !classSection) return;
    const timeout = window.setTimeout(() => {
      writeDraft(draftKey, { className, courseCode, classSection });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [className, classSection, courseCode, draftKey]);

  if (!isLoaded || !user || user.role?.toLowerCase() !== "teacher") return null;

  const handleCreateClass = async () => {
    if (!className.trim()) {
      setClassError("Enter a class name.");
      return;
    }
    setCreatingClass(true);
    setClassError("");
    try {
      await createClassroom({ name: className, course_code: courseCode, class_section: classSection });
      clearDraft(draftKey);
      setShowDraftNotice(false);
      setClassName("");
      setCourseCode("");
      setClassSection("");
      refetchClassrooms();
    } catch (error) {
      setClassError(error instanceof Error ? error.message : "Failed to create class.");
    } finally {
      setCreatingClass(false);
    }
  };

  return (
    <div className="view-transition space-y-8">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-cvsu-green">Faculty assignment tracking</p>
          <h2 className="mt-2 font-syne text-2xl tracking-tight text-[#1C1C1C]">Assigned Assessments</h2>
          <p className="mt-1 text-xs text-stone-500">
            Students listed here have been assigned an assessment but have not completed it yet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center justify-center gap-1.5 self-start rounded-full border border-stone-300 bg-[#F7F7F2] px-3 py-1.5 text-xs font-bold text-stone-700 transition-colors hover:bg-stone-200 sm:self-auto"
        >
          <IconRefresh size={13} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <section className="rounded-3xl border border-cvsu-green/20 bg-cvsu-light/40 p-5">
        <h3 className="font-syne text-base text-[#1C1C1C]">Class access codes</h3>
        <p className="mt-1 text-xs text-stone-600">Create a class once, then share its code. Students who join later inherit its existing assigned assessments.</p>
        {showDraftNotice && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-cvsu-green/30 bg-white px-3 py-2 text-xs font-semibold text-cvsu-green" role="status">
            <span>Your unfinished class setup was restored.</span>
            <button type="button" onClick={() => { clearDraft(draftKey); setClassName(""); setCourseCode(""); setClassSection(""); setShowDraftNotice(false); }} className="font-bold underline">
              Discard draft
            </button>
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
          <input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Class name" className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-[#1C1C1C]" />
          <input value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="Course code" className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-[#1C1C1C]" />
          <input value={classSection} onChange={(event) => setClassSection(event.target.value)} placeholder="Section" className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-[#1C1C1C]" />
          <button type="button" onClick={handleCreateClass} disabled={creatingClass} className="rounded-xl bg-cvsu-green px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {creatingClass ? "Creating..." : "Create class"}
          </button>
        </div>
        {classError && <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{classError}</p>}
        {classrooms.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {classrooms.map((classroom) => (
              <div key={classroom.id} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-[#1C1C1C]">{classroom.name}</p>
                  <p className="text-[11px] text-stone-500">{classroom.course_code || "No course code"}{classroom.class_section ? ` · Section ${classroom.class_section}` : ""}</p>
                </div>
                <span className="rounded-full bg-cvsu-vibrant px-3 py-1 font-mono text-xs font-bold text-cvsu-dark">{classroom.invite_code}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className="skeleton h-28 w-full rounded-3xl" />)}
        </div>
      ) : assessments.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-[#F7F7F2]/60 p-10 text-center text-xs text-stone-500">
          No students are currently waiting on an assigned assessment.
        </div>
      ) : (
        <div className="divide-y divide-stone-200 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs">
          {assessments.map((assessment) => (
            <section key={assessment.id} className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#1C1C1C]">{assessment.topic}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {assessment.quiz_type} · {assessment.question_count} questions
                  </p>
                </div>
                <span className="self-start rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">
                  {assessment.pending_student_emails.length} pending
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {assessment.pending_student_emails.map((email) => (
                  <span key={email} className="rounded-full border border-stone-200 bg-[#F7F7F2] px-3 py-1.5 font-mono text-xs text-stone-700">
                    {email}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
