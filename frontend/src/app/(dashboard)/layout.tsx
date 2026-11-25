"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import {
  QuizGenerationProvider,
  useQuizGeneration,
} from "@/lib/quizGeneration/QuizGenerationContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconCvSU, IconLogOut } from "@/components/icons";
import AIChatbot from "@/components/shared/AIChatbot";
import Link from "next/link";

const FACULTY_NAV_ITEMS = [
  { href: "/studio", icon: "✦", label: "Generate" },
  { href: "/studio/published", icon: "▤", label: "Published Assessments" },
  { href: "/studio/assigned", icon: "☑", label: "Assigned" },
  { href: "/studio/classes", icon: "▣", label: "Classes" },
  { href: "/studio/students", icon: "♙", label: "Enrolled Students" },
  { href: "/grades", icon: "▥", label: "Gradebook" },
] as const;

function StudioGenerationBanner() {
  const { generation, clearGeneration } = useQuizGeneration();
  const pathname = usePathname();

  if (generation.status === "idle") return null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce8dd] bg-[#eef5e9] px-4 py-3 text-xs font-medium text-cvsu-dark shadow-2xs">
      <div className="flex items-center gap-2.5">
        {generation.status === "generating" && (
          <span
            className="h-2.5 w-2.5 rounded-full bg-cvsu-green animate-pulse"
            aria-hidden="true"
          />
        )}
        <span>
          {generation.status === "generating" &&
            `Generating assessment${generation.topic ? ` for "${generation.topic}"` : ""} in the background...`}
          {generation.status === "completed" &&
            `Assessment draft ready${generation.topic ? ` for "${generation.topic}"` : ""}.`}
          {generation.status === "error" &&
            (generation.error || "Quiz generation encountered an error.")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {pathname !== "/studio" && (
          <Link
            href="/studio"
            className="rounded-lg bg-cvsu-green px-3 py-1.5 font-semibold text-white transition hover:opacity-95"
          >
            Open Generate
          </Link>
        )}
        {generation.status !== "generating" && (
          <button
            type="button"
            onClick={clearGeneration}
            className="rounded-lg px-2.5 py-1 text-cvsu-dark/70 transition hover:bg-white/70 hover:text-cvsu-dark cursor-pointer"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isTeacher = user?.role?.toUpperCase() === "TEACHER" || user?.role?.toLowerCase() === "teacher";
  const isStudentRoute = pathname === "/dashboard" || pathname === "/student" || pathname === "/review" || pathname.startsWith("/quiz");
  const isTeacherRoute = pathname === "/studio" || pathname === "/teacher" || pathname.startsWith("/studio/");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLDialogElement>(null);
  const drawerSheetRef = useRef<HTMLDivElement>(null);

  const openMobileDrawer = () => {
    const dialog = mobileDrawerRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    setIsMobileNavOpen(true);
  };

  const closeMobileDrawer = () => {
    const dialog = mobileDrawerRef.current;
    if (dialog && dialog.open) {
      dialog.close();
    }
    setIsMobileNavOpen(false);
  };

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

  if (isTeacher) {
    return (
      <QuizGenerationProvider>
        <div className="min-h-screen bg-[#F7F7F2] text-[#1C1C1C] selection:bg-cvsu-vibrant selection:text-cvsu-dark">
          <header className="fixed inset-x-0 top-0 z-40 h-[72px] border-b border-white/10 bg-cvsu-dark text-white shadow-md">
            <div className="flex h-full items-center justify-between px-4 sm:px-8">
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={openMobileDrawer}
                  aria-label="Open navigation menu"
                  aria-expanded={isMobileNavOpen}
                  aria-controls="faculty-mobile-drawer"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-white/90 transition-colors hover:bg-white/10 hover:text-cvsu-vibrant md:hidden cursor-pointer"
                >
                  <span className="flex w-5 flex-col gap-1.5" aria-hidden="true">
                    <span className="h-0.5 w-full rounded-full bg-current" />
                    <span className="h-0.5 w-full rounded-full bg-current" />
                    <span className="h-0.5 w-full rounded-full bg-current" />
                  </span>
                </button>
                <Link href="/studio" className="flex items-center gap-3 group shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cvsu-vibrant text-cvsu-dark shadow-sm transition-transform group-hover:scale-105">
                    <IconCvSU size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-syne text-base tracking-tight text-white transition-colors group-hover:text-cvsu-vibrant sm:text-lg">
                        Quiz Hero
                      </span>
                      <span className="rounded-full bg-cvsu-vibrant px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cvsu-dark">
                        CvSU
                      </span>
                    </div>
                    <p className="hidden text-[11px] font-medium text-white/60 sm:block">
                      Cavite State University &bull; Faculty Studio
                    </p>
                  </div>
                </Link>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-bold leading-none text-white">{user.full_name || user.name}</p>
                  <p className="mt-1 font-mono text-[11px] leading-none text-white/60">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    router.push("/login");
                  }}
                  title="Sign Out"
                  className="rounded-xl p-2 text-white/70 transition-all hover:scale-105 hover:bg-white/10 hover:text-cvsu-vibrant"
                >
                  <IconLogOut size={18} />
                </button>
              </div>
            </div>
          </header>

          <dialog
            ref={mobileDrawerRef}
            id="faculty-mobile-drawer"
            aria-label="Faculty Studio navigation"
            onCancel={() => setIsMobileNavOpen(false)}
            onClose={() => setIsMobileNavOpen(false)}
            onClick={(event) => {
              if (drawerSheetRef.current && !drawerSheetRef.current.contains(event.target as Node)) {
                closeMobileDrawer();
              }
            }}
            className="inset-0 m-0 h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-0 backdrop:bg-black/50 md:hidden"
          >
            <div
              ref={drawerSheetRef}
              className="flex h-full w-[min(20rem,84vw)] flex-col justify-between bg-[#eef5e9] p-4 text-cvsu-dark shadow-2xl border-r border-[#dce8dd]"
            >
              <div>
                <div className="mb-5 flex items-center justify-between border-b border-[#dce8dd] pb-4">
                  <div>
                    <p className="font-syne text-base font-bold text-cvsu-dark">Faculty Studio</p>
                    <p className="font-mono text-[11px] text-stone-600 truncate max-w-[13rem]">
                      {user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeMobileDrawer}
                    aria-label="Close navigation menu"
                    autoFocus
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-cvsu-dark hover:bg-white/80 font-bold text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <nav className="space-y-2" aria-label="Faculty Studio mobile navigation">
                  {FACULTY_NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={closeMobileDrawer}
                        className={`flex items-center rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                          isActive
                            ? "bg-cvsu-green text-white shadow-sm"
                            : "text-cvsu-dark hover:bg-white/80"
                        }`}
                      >
                        <span className="w-6 text-center text-base" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="ml-3">{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <button
                type="button"
                onClick={() => {
                  closeMobileDrawer();
                  logout();
                  router.push("/login");
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#dce8dd] bg-white px-4 py-3 text-xs font-bold text-cvsu-dark hover:bg-stone-50 cursor-pointer"
              >
                <IconLogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </dialog>

          <aside
            className={`fixed bottom-0 left-0 top-[72px] z-30 hidden border-r border-[#dce8dd] bg-[#eef5e9] transition-[width] duration-300 md:block ${
              isSidebarCollapsed ? "w-[76px]" : "w-60"
            }`}
          >
            <div className="flex h-full flex-col p-3">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
                aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                aria-expanded={!isSidebarCollapsed}
                title={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl text-cvsu-dark transition-colors hover:bg-white/70"
              >
                <span className="flex w-5 flex-col gap-1" aria-hidden="true">
                  <span className="h-0.5 w-full rounded-full bg-current" />
                  <span className="h-0.5 w-full rounded-full bg-current" />
                  <span className="h-0.5 w-full rounded-full bg-current" />
                </span>
              </button>

              <nav className="space-y-2" aria-label="Faculty Studio navigation">
                {FACULTY_NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                        isActive ? "bg-cvsu-green text-white shadow-sm" : "text-cvsu-dark hover:bg-white/70"
                      }`}
                    >
                      <span className="w-6 text-center text-base" aria-hidden="true">
                        {item.icon}
                      </span>
                      {!isSidebarCollapsed && <span className="ml-3">{item.label}</span>}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          <main
            className={`min-h-screen pt-[72px] transition-[padding] duration-300 ${
              isSidebarCollapsed ? "md:pl-[76px]" : "md:pl-60"
            }`}
          >
            <div className="mx-auto max-w-7xl px-4 pt-8 pb-28 sm:px-8 sm:pt-10">
              <StudioGenerationBanner />
              {children}
            </div>
          </main>
          <AIChatbot currentUser={user} />
        </div>
      </QuizGenerationProvider>
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

          <div className="flex items-center gap-4 text-sm font-semibold text-white/80">
            {!isTeacher && (
              <Link href="/review" className="rounded-full px-3 py-1.5 transition hover:bg-white/10 hover:text-cvsu-vibrant">
                Due Reviews
              </Link>
            )}
            <span>{isTeacher ? "Faculty Studio" : "Student Studio"}</span>
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
      <main className="w-full max-w-6xl px-4 sm:px-8 pt-8 pb-28 sm:pt-12 flex-1">
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