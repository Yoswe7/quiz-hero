"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { fetchClassrooms } from "@/lib/api";
import { IconRefresh } from "@/components/icons";

export default function ClassesPage() {
  const { user, isLoaded } = useAuth();
  const { data: classrooms = [], isLoading, refetch } = useQuery({
    queryKey: ["classrooms", "teacher"],
    queryFn: fetchClassrooms,
    enabled: isLoaded && user?.role?.toUpperCase() === "TEACHER",
  });

  if (!isLoaded || !user || user.role?.toUpperCase() !== "TEACHER") return null;

  return (
    <div className="view-transition space-y-8">
      <div className="flex items-end justify-between border-b border-stone-200 pb-6">
        <div>
          <p className="text-sm font-semibold text-cvsu-green">Faculty Studio</p>
          <h2 className="mt-2 font-syne text-2xl tracking-tight text-[#1C1C1C]">Classes</h2>
          <p className="mt-1 text-xs text-stone-500">View the classes and sections currently handled by you.</p>
        </div>
        <button type="button" onClick={() => refetch()} disabled={isLoading} className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-[#F7F7F2] px-3 py-1.5 text-xs font-bold text-stone-700">
          <IconRefresh size={13} className={isLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((item) => <div key={item} className="skeleton h-24 rounded-3xl" />)}</div>
      ) : classrooms.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center text-xs text-stone-500">
          No classes yet. Create one from the Assigned section.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classrooms.map((classroom) => (
            <div key={classroom.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs">
              <h3 className="text-base font-bold text-[#1C1C1C]">{classroom.name}</h3>
              <p className="mt-1 text-xs text-stone-500">
                {classroom.course_code || "No course code"}{classroom.class_section ? ` · Section ${classroom.class_section}` : ""}
              </p>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-cvsu-light px-4 py-3">
                <span className="text-xs font-semibold text-cvsu-green">Invite code</span>
                <span className="font-mono text-sm font-bold tracking-widest text-cvsu-dark">{classroom.invite_code}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
