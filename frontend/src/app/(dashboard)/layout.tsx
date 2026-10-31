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

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/login");
    }
  }, [user, isLoaded, router]);

  if (!isLoaded || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-cvsu-green font-medium">
        Loading...
      </div>
    );
  }

  const isTeacher = user.role?.toUpperCase() === "TEACHER" || user.role?.toLowerCase() === "teacher";
  const isInStudentMode = pathname === "/dashboard" || pathname === "/student" || pathname.startsWith("/quiz");

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
                <span className="font-bold text-base sm:text-lg tracking-tight text-white group-hover:text-cvsu-vibrant transition-colors">
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

          {/* Center: Dual-Role Switcher (RENDERED ONLY FOR TEACHER ROLE) */}
          {isTeacher && (
            <div className="flex items-center bg-white/10 p-1 rounded-full border border-white/20 text-xs font-semibold shadow-inner">
              <Link
                href="/studio"
                className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
                  !isInStudentMode
                    ? "bg-white text-cvsu-dark font-extrabold shadow-sm scale-100"
                    : "text-white/80 hover:text-white hover:bg-white/5"
                }`}
              >
                <span>👨‍🏫</span>
                <span className="hidden md:inline">Faculty Studio</span>
                <span className="md:hidden">Studio</span>
              </Link>

              <Link
                href="/dashboard"
                className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
                  isInStudentMode
                    ? "bg-cvsu-vibrant text-cvsu-dark font-extrabold shadow-sm scale-100"
                    : "text-white/80 hover:text-white hover:bg-white/5"
                }`}
              >
                <span>🎓</span>
                <span className="hidden md:inline">Student View</span>
                <span className="md:hidden">Student</span>
              </Link>
            </div>
          )}

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

      {/* Faculty Student Preview Notification Banner */}
      {isTeacher && isInStudentMode && (
        <div className="w-full bg-[#eab308]/15 border-b border-[#eab308]/30 py-2 px-4 sm:px-8 text-center text-xs font-semibold text-amber-900 flex items-center justify-center gap-2">
          <span>👁️</span>
          <span>Faculty Preview Active: You are experiencing published quizzes exactly as students see them.</span>
          <Link href="/studio" className="underline font-bold text-[#14532d] hover:text-[#166534] ml-2">
            Return to Faculty Studio &rarr;
          </Link>
        </div>
      )}

      {/* Main Content Area */}
      <main className="w-full max-w-6xl px-4 sm:px-8 py-8 sm:py-12 flex-1">
        <div className="bg-white rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.06)] border border-stone-200/90 p-6 sm:p-10">
          {children}
        </div>
      </main>

      <footer className="w-full border-t border-stone-200 bg-white py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-stone-500 font-medium">
          <p>Cavite State University &bull; Quiz Hero AI Assessment Suite</p>
          <p className="font-mono text-[11px] text-stone-400">Institutional Role-Guarded Access</p>
        </div>
      </footer>

      <AIChatbot currentUser={user} />
    </div>
  );
}
