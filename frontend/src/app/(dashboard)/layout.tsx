"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { IconCvSU, IconLogOut } from "@/components/icons";
import AIChatbot from "@/components/shared/AIChatbot";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isTeacher = user?.role?.toUpperCase() === "TEACHER" || user?.role?.toLowerCase() === "teacher";
  const isStudentRoute = pathname === "/dashboard" || pathname === "/student" || pathname.startsWith("/quiz");
  const isTeacherRoute = pathname === "/studio" || pathname === "/teacher";

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/login");
    }
  }, [user, isLoaded, router]);

  useEffect(() => {
    if (!isLoaded || !user) return;

    if (isTeacher && isStudentRoute) {
      router.replace("/studio");
    } else if (!isTeacher && isTeacherRoute) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isTeacher, isStudentRoute, isTeacherRoute, router, user]);

  if (!isLoaded || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-cvsu-green font-medium">
        Loading...
      </div>
    );
  }

  if ((isTeacher && isStudentRoute) || (!isTeacher && isTeacherRoute)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-cvsu-green font-medium">
        Redirecting to your workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F2] text-[#1C1C1C] flex flex-col items-center selection:bg-cvsu-vibrant selection:text-cvsu-dark relative view-transition">
      {/* Institutional Top Navbar in Academic Green */}
      <header className="w-full sticky top-0 z-40 bg-cvsu-dark text-white border-b border-white/10 shadow-md backdrop-blur-md">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-3.5 flex justify-between items-center gap-3">
          <Link
            href={isTeacher ? "/studio" : "/dashboard"}
            className="flex items-center gap-3 group cursor-pointer shrink-0"
          >
            <div className="w-10 h-10 rounded-2xl bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-200">
              <IconCvSU size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-syne text-base sm:text-lg tracking-tight text-white group-hover:text-cvsu-vibrant transition-colors">
                  Quiz Hero
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cvsu-vibrant text-cvsu-dark shadow-xs">
                  CvSU
                </span>
              </div>
              <p className="text-[11px] text-white/60 font-medium hidden sm:block">
                Cavite State University &bull; Academic Assessment Suite
              </p>
            </div>
          </Link>

          <div className="text-sm font-semibold text-white/80">
            {isTeacher ? "Faculty Studio" : "Student Studio"}
          </div>

          {/* Right: User Profile & Actions */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white leading-none">{user.full_name || user.name}</p>
              <p className="text-[11px] text-white/60 font-mono mt-1 leading-none">{user.email}</p>
            </div>

            {/* Role Badge for Pure Students */}
            {!isTeacher && (
              <span className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider font-mono shadow-xs border bg-cvsu-vibrant text-cvsu-dark border-cvsu-vibrant">
                Student
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                logout();
                router.push("/login");
              }}
              title="Sign Out"
              className="p-2 text-white/70 hover:text-cvsu-vibrant hover:bg-white/10 rounded-xl transition-all hover:scale-105 cursor-pointer"
            >
              <IconLogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-6xl px-4 sm:px-8 py-8 sm:py-12 flex-1">
        <div className="bg-white rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.06)] border border-stone-200/90 p-6 sm:p-10">
          {children}
        </div>
      </main>

      <footer className="w-full border-t border-stone-200 bg-white py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-stone-500 font-medium">
          <p className="font-syne">Cavite State University &bull; Quiz Hero AI Assessment Suite</p>
          <p className="font-mono text-[11px] text-stone-400">Institutional Role-Guarded Access</p>
        </div>
      </footer>

      <AIChatbot currentUser={user} />
    </div>
  );
}
