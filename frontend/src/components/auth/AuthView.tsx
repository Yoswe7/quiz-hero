"use client";

import React, { useState, useEffect, ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface AuthViewProps {
  mode?: "signin" | "signup";
  role?: "STUDENT" | "TEACHER";
  onRoleChange?: (role: "STUDENT" | "TEACHER") => void;
  onModeChange?: (mode: "signin" | "signup") => void;
  children: ReactNode;
}

export function AuthView({
  mode: propsMode,
  role: propsRole,
  onRoleChange,
  onModeChange,
  children,
}: AuthViewProps) {
  const searchParams = useSearchParams();

  const urlMode = searchParams.get("mode") as "signin" | "signup" | null;
  const urlRoleParam = searchParams.get("role")?.toLowerCase();
  const urlRole = urlRoleParam === "faculty" || urlRoleParam === "teacher" ? "TEACHER" : "STUDENT";

  const [mode, setMode] = useState<"signin" | "signup">(propsMode || urlMode || "signin");
  const [role, setRole] = useState<"STUDENT" | "TEACHER">(propsRole || urlRole);

  useEffect(() => {
    if (urlMode) setMode(urlMode);
    if (searchParams.has("role")) setRole(urlRole);
  }, [searchParams, urlMode, urlRole]);

  const handleRoleToggle = (newRole: "STUDENT" | "TEACHER") => {
    setRole(newRole);
    if (onRoleChange) onRoleChange(newRole);
  };

  const handleModeToggle = (newMode: "signin" | "signup") => {
    setMode(newMode);
    if (onModeChange) onModeChange(newMode);
  };

  const isLogin = mode === "signin";

  const content = {
    signin: {
      STUDENT: {
        title: "Back in the Zone",
        sub: "Master your topics, one recall at a time.",
        bullets: [
          "Sign in securely using your official @cvsu.edu.ph student account",
          "Automated SM-2 spaced repetition for long-term retention",
          "Access AI-curated quizzes & flashcard review decks",
        ],
      },
      TEACHER: {
        title: "Jump back in.",
        sub: "Assessments that grade themselves while you teach.",
        bullets: [
          "Instant AI generation from lecture notes, PDFs & syllabi via Gemini 3.5 Flash",
          "Real-time gradebook analytics & student roster tracking",
          "Anti-tampering score recalculation & secure assessment windows",
        ],
      },
    },
    signup: {
      STUDENT: {
        title: "Start Learning",
        sub: "Your learning journey, boosted by AI.",
        bullets: [
          "Instant join via class invite links and secure @cvsu.edu.ph authentication",
          "Automated spaced-repetition flashcards to conquer tough exams",
          "Track your personal study streaks, mastery rates, and score histories",
        ],
      },
      TEACHER: {
        title: "Streamline Your Teaching",
        sub: "Build smarter classrooms in minutes, not hours.",
        bullets: [
          "Deploy Gemini-powered AI quiz generation from your lecture notes and syllabi",
          "Monitor student rosters, view assignment submissions, and sync gradebooks",
          "Institutional security with automated anti-tampering score tracking",
        ],
      },
    },
  };

  const activeContent = content[mode][role];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#07241d] text-white flex flex-col justify-between p-6 sm:p-10 font-['Syne',sans-serif]">
      
      {/* ========================================================================= */}
      {/* FADED BACKGROUND IMAGE & TRANSLUCENT OVERLAY                              */}
      {/* ========================================================================= */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-45 pointer-events-none z-0"
        style={{ backgroundImage: `url('/exam.jpg')` }} 
      />
      
      {/* Semi-transparent gradient wash so the background image peaks through */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#07241d]/50 via-[#07241d]/70 to-[#07241d] pointer-events-none z-0" />
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00e699]/10 border border-[#00e699]/30 flex items-center justify-center">
            <span className="font-bold text-[#00e699] text-xl">Q</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">Quiz Hero</h1>
            <p className="text-[11px] text-[#a3c1b6]">Cavite State University - Imus City Campus</p>
          </div>
        </div>

        <Link
          href="/"
          className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold backdrop-blur-md transition-all flex items-center gap-2"
        >
          <span>&larr;</span> Back to Home
        </Link>
      </header>

      {/* Main Grid: Automatically flips side for Login vs Signup */}
      <main className="relative z-10 w-full max-w-6xl mx-auto my-auto py-8">
        <div
          className={`flex flex-col lg:flex-row items-center justify-between gap-12 transition-all duration-500 ${
            !isLogin ? "lg:flex-row-reverse" : ""
          }`}
        >
          {/* Dynamic Hero Text Area */}
          <div className="w-full lg:w-1/2 space-y-6">
            <h2 className="text-4xl sm:text-5xl font-extrabold text-[#00e699] tracking-tight leading-tight">
              {activeContent.title}
            </h2>
            <p className="text-lg text-white font-medium">
              {activeContent.sub}
            </p>
            <ul className="space-y-3 pt-2 text-xs sm:text-sm text-[#a3c1b6]">
              {activeContent.bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#00e699] mt-1.5 flex-shrink-0" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* White Authentication Card Box */}
          <div className="w-full max-w-md bg-white rounded-[32px] p-8 sm:p-10 text-slate-900 shadow-2xl transition-all duration-300">
            {/* Top Segmented Tab Control (Sign In vs Create Account) */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-full border border-slate-200 mb-6">
              <button
                type="button"
                onClick={() => handleModeToggle("signin")}
                className={`py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  isLogin
                    ? "bg-[#6b8e4e] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleModeToggle("signup")}
                className={`py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  !isLogin
                    ? "bg-[#6b8e4e] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Dynamic Card Header */}
            <div className="text-center space-y-1 mb-6">
              <h3 className="text-2xl font-bold text-[#0b3126]">
                {isLogin ? "Log In" : "Get Started"}
              </h3>
              <p className="text-xs text-slate-500">
                {isLogin
                  ? "Sign in with your registered @cvsu.edu.ph account"
                  : "Select your role to initialize your workspace"}
              </p>
            </div>

            {/* Role Toggle Selector (Student vs Faculty) */}
            <div className="relative p-1 bg-slate-100 rounded-full border border-slate-200 flex items-center mb-6">
              <button
                type="button"
                onClick={() => handleRoleToggle("STUDENT")}
                className={`relative z-10 w-1/2 py-2.5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer ${
                  role === "STUDENT"
                    ? "bg-[#6b8e4e] text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => handleRoleToggle("TEACHER")}
                className={`relative z-10 w-1/2 py-2.5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer ${
                  role === "TEACHER"
                    ? "bg-[#6b8e4e] text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Faculty
              </button>
            </div>

            {/* Form Content / Injected Children */}
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-[11px] text-[#a3c1b6]/60">
        &copy; {new Date().getFullYear()} Cavite State University &bull; Software Engineering Assessment Platform
      </footer>
    </div>
  );
}