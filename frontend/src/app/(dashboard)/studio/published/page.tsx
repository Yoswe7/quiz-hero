"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import TeacherDashboard from "@/features/assessment-engine/components/TeacherDashboard";

export default function PublishedAssessmentsPage() {
  const { user, isLoaded } = useAuth();

  if (!isLoaded || !user || user.role?.toLowerCase() !== "teacher") return null;

  return <TeacherDashboard currentUser={user} onViewGrades={() => {}} view="published" />;
}
