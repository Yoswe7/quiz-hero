"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import Gradebook from "@/features/gradebook/components/Gradebook";
import { useRouter } from "next/navigation";

export default function GradesPage() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const normalizedRole: "teacher" | "student" =
    user.role?.toLowerCase() === "teacher" ? "teacher" : "student";

  return (
    <Gradebook
      role={normalizedRole}
      studentName={user.full_name || user.name || user.email.split("@")[0]}
      studentEmail={user.email}
      onBack={() => router.push(normalizedRole === "teacher" ? "/studio" : "/dashboard")}
    />
  );
}
