"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { fetchClassrooms, fetchClassroomMembers } from "@/lib/api";
import { IconRefresh } from "@/components/icons";

export default function EnrolledStudentsPage() {
  const { user, isLoaded } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState("");
  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", "teacher"],
    queryFn: fetchClassrooms,
    enabled: isLoaded && user?.role?.toUpperCase() === "TEACHER",
  });
  const selectedClass = selectedClassId || classrooms[0]?.id || "";
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["classroom-members", selectedClass],
    queryFn: () => fetchClassroomMembers(selectedClass),
    enabled: Boolean(selectedClass),
  });

  if (!isLoaded || !user || user.role?.toUpperCase() !== "TEACHER") return null;

  return (
    <div className="view-transition space-y-8">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-cvsu-green">Class roster</p>
          <h2 className="mt-2 font-syne text-2xl tracking-tight text-[#1C1C1C]">Enrolled Students</h2>
          <p className="mt-1 text-xs text-stone-500">View students who joined through your class invite link and their assessment status.</p>
        </div>
        <div className="flex gap-2">
          <select value={selectedClass} onChange={(event) => setSelectedClassId(event.target.value)} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700">
            {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
          </select>
          <button type="button" onClick={() => refetch()} disabled={isLoading || !selectedClass} className="rounded-full border border-stone-300 bg-[#F7F7F2] px-3 py-2 text-xs font-bold text-stone-700">
            <IconRefresh size={13} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {!selectedClass ? (
        <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center text-xs text-stone-500">Create a class and share its invite code to enroll students.</div>
      ) : isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="skeleton h-24 rounded-3xl" />)}</div>
      ) : data?.members.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center text-xs text-stone-500">No students have joined this class yet.</div>
      ) : (
        <div className="divide-y divide-stone-200 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs">
          {data?.members.map((member) => (
            <div key={member.student_email} className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm font-bold text-[#1C1C1C]">{member.student_email}</p>
                  <p className="mt-1 text-[11px] text-stone-500">Joined {new Date(member.joined_at).toLocaleDateString()}</p>
                </div>
                <span className="rounded-full bg-cvsu-light px-3 py-1 text-[11px] font-bold text-cvsu-green">{member.assigned_assessments.length} assigned</span>
              </div>
              {member.assigned_assessments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {member.assigned_assessments.map((assessment) => (
                    <span key={assessment.id} className={`rounded-full border px-3 py-1 text-xs ${assessment.completed ? "border-cvsu-green/30 bg-cvsu-light text-cvsu-green" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      {assessment.topic} · {assessment.completed ? "Completed" : "Pending"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
