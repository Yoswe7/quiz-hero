"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import TeacherDashboard from "@/features/assessment-engine/components/TeacherDashboard";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TeacherPage() {
  const { user, isLoaded } = useAuth();
  const router = useRouter();

  const isTeacher = user?.role?.toUpperCase() === "TEACHER" || user?.role?.toLowerCase() === "teacher";

  useEffect(() => {
    if (isLoaded && !isTeacher) {
      router.replace("/dashboard");
    }
  }, [user, isLoaded, isTeacher, router]);

  if (!isLoaded || !isTeacher || !user) return null;

  return (
    <TeacherDashboard
      currentUser={user}
      onViewGrades={() => router.push("/grades")}
    />
  );
}
