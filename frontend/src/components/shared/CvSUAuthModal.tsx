"use client";
import { useState, useEffect, useRef } from "react";
import { UserRole, CvSUUser } from "@/types/quiz";
import { authenticateCvSUGoogle } from "@/lib/api";
import {
  IconCvSU,
  IconStudent,
  IconFaculty,
  IconArrowRight,
} from "@/components/icons";

interface Props {
  initialRole?: UserRole;
  onLoginSuccess: (user: CvSUUser) => void;
  onClose?: () => void;
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export default function CvSUAuthModal({
  initialRole = "student",
  onLoginSuccess,
  onClose,
}: Props) {
  const [role, setRole] = useState<UserRole>(initialRole);
  const [emailInput, setEmailInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  // Lock body scroll on background page when modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Handle Google Identity Services button
  useEffect(() => {
    if (typeof window === "undefined" || !GOOGLE_CLIENT_ID || !googleBtnRef.current) return;

    const handleCredentialResponse = async (response: any) => {
      setIsLoading(true);
      setError("");
      try {
        const idToken = response.credential;
        const user = await authenticateCvSUGoogle({ credential: idToken, role });
        onLoginSuccess(user);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to verify CvSU Google account.");
      } finally {
        setIsLoading(false);
      }
    };

    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        hosted_domain: "cvsu.edu.ph",
      });

      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 320,
      });
    }
  }, [role, onLoginSuccess]);

  // Clean Name Helper from email prefix
  const deriveNameFromEmail = (email: string) => {
    const prefix = email.split("@")[0].replace(/[._-]/g, " ");
    return prefix
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  };

  const handleCvSULogin = async (email: string, userRole: UserRole) => {
    setIsLoading(true);
    setError("");

    if (!email.toLowerCase().endsWith("@cvsu.edu.ph")) {
      setError("Institutional access is restricted to verified @cvsu.edu.ph accounts.");
      setIsLoading(false);
      return;
    }

    try {
      const derivedName = deriveNameFromEmail(email);
      const user = await authenticateCvSUGoogle({
        email: email.toLowerCase(),
        name: derivedName,
        role: userRole,
        is_simulation: true,
      });

      localStorage.setItem("cvsu_user", JSON.stringify(user));
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify CvSU account credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setError("Please enter your CvSU institutional email or username.");
      return;
    }
    const clean = emailInput.trim().toLowerCase();
    const fullEmail = clean.endsWith("@cvsu.edu.ph") ? clean : `${clean}@cvsu.edu.ph`;
    handleCvSULogin(fullEmail, role);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto modal-backdrop-anim">
      {/* Background Decorative Ambient Glows */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-cvsu-green/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main SaaS Modal Container - Centered */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-premium-modal border border-slate-200/90 overflow-hidden text-slate-900 mx-auto my-auto modal-box-anim">
        
        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all text-xs font-bold btn-tactile hover:scale-105 cursor-pointer"
          >
            ✕
          </button>
        )}

        {/* Modal Header */}
        <div className="pt-8 pb-6 px-8 text-center bg-cvsu-dark text-white border-b border-white/10">
          <div className="w-14 h-14 rounded-2xl bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center mx-auto mb-3 shadow-md">
            <IconCvSU size={28} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <h2 className="text-2xl font-black tracking-tight text-white">Quiz Hero</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cvsu-vibrant text-cvsu-dark shadow-xs">
              CvSU Imus
            </span>
          </div>
          <p className="text-xs text-white/70 font-medium">
            Cavite State University – Imus Campus
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 bg-white">
          
          {/* Animated Sliding Pill Role Selector */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2">
              Select Institutional Role
            </label>
            <div className="relative grid grid-cols-2 p-1 bg-[#F7F7F2] rounded-full border border-stone-200 text-xs">
              
              {/* Sliding Pill Indicator */}
              <div
                className="absolute top-1 bottom-1 rounded-full bg-cvsu-green shadow-md spring-transition"
                style={{
                  width: "calc(50% - 4px)",
                  left: role === "student" ? "4px" : "calc(50%)",
                }}
              />

              <button
                type="button"
                onClick={() => setRole("student")}
                className={`relative z-10 py-2.5 px-3 rounded-full font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  role === "student" ? "text-white" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <IconStudent size={16} weight={role === "student" ? "fill" : "regular"} />
                <span>Student</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("teacher")}
                className={`relative z-10 py-2.5 px-3 rounded-full font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  role === "teacher" ? "text-white" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <IconFaculty size={16} weight={role === "teacher" ? "fill" : "regular"} />
                <span>Faculty / Instructor</span>
              </button>
            </div>
          </div>

          {/* Official Google Identity Button */}
          {GOOGLE_CLIENT_ID ? (
            <div>
              <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-200" />
                </div>
                <div className="relative flex justify-center text-[11px]">
                  <span className="bg-white px-3 text-stone-400 font-bold uppercase tracking-wider">or sign in with email</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Fast-Access Directory Cards */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2.5">
              Verified {role === "student" ? "Student" : "Faculty"} Directory Access
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {role === "student" ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleCvSULogin("juan.delacruz@cvsu.edu.ph", "student")}
                    disabled={isLoading}
                    className="p-3.5 text-left bg-[#F7F7F2] hover:bg-white border border-stone-200 hover:border-cvsu-green rounded-2xl transition-all duration-150 flex items-center justify-between group disabled:opacity-50 btn-tactile hover:-translate-y-0.5 hover:shadow-sm cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1C1C1C] group-hover:text-cvsu-green font-mono truncate">
                        juan.delacruz@cvsu.edu.ph
                      </p>
                      <p className="text-[11px] text-stone-500 mt-0.5">Enrolled Undergraduate Student</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white border border-stone-200 group-hover:bg-cvsu-green group-hover:text-cvsu-vibrant flex items-center justify-center text-stone-400 text-xs transition-colors shrink-0 ml-2 shadow-xs">
                      <IconArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-150" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCvSULogin("maria.santos@cvsu.edu.ph", "student")}
                    disabled={isLoading}
                    className="p-3.5 text-left bg-[#F7F7F2] hover:bg-white border border-stone-200 hover:border-cvsu-green rounded-2xl transition-all duration-150 flex items-center justify-between group disabled:opacity-50 btn-tactile hover:-translate-y-0.5 hover:shadow-sm cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1C1C1C] group-hover:text-cvsu-green font-mono truncate">
                        maria.santos@cvsu.edu.ph
                      </p>
                      <p className="text-[11px] text-stone-500 mt-0.5">Enrolled Undergraduate Student</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white border border-stone-200 group-hover:bg-cvsu-green group-hover:text-cvsu-vibrant flex items-center justify-center text-stone-400 text-xs transition-colors shrink-0 ml-2 shadow-xs">
                      <IconArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-150" />
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleCvSULogin("r.bautista@cvsu.edu.ph", "teacher")}
                    disabled={isLoading}
                    className="p-3.5 text-left bg-[#F7F7F2] hover:bg-white border border-stone-200 hover:border-cvsu-green rounded-2xl transition-all duration-150 flex items-center justify-between group disabled:opacity-50 btn-tactile hover:-translate-y-0.5 hover:shadow-sm cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1C1C1C] group-hover:text-cvsu-green font-mono truncate">
                        r.bautista@cvsu.edu.ph
                      </p>
                      <p className="text-[11px] text-stone-500 mt-0.5">Faculty • Department Chair</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white border border-stone-200 group-hover:bg-cvsu-green group-hover:text-cvsu-vibrant flex items-center justify-center text-stone-400 text-xs transition-colors shrink-0 ml-2 shadow-xs">
                      <IconArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-150" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCvSULogin("e.ramos@cvsu.edu.ph", "teacher")}
                    disabled={isLoading}
                    className="p-3.5 text-left bg-[#F7F7F2] hover:bg-white border border-stone-200 hover:border-cvsu-green rounded-2xl transition-all duration-150 flex items-center justify-between group disabled:opacity-50 btn-tactile hover:-translate-y-0.5 hover:shadow-sm cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1C1C1C] group-hover:text-cvsu-green font-mono truncate">
                        e.ramos@cvsu.edu.ph
                      </p>
                      <p className="text-[11px] text-stone-500 mt-0.5">Faculty • Course Instructor</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white border border-stone-200 group-hover:bg-cvsu-green group-hover:text-cvsu-vibrant flex items-center justify-center text-stone-400 text-xs transition-colors shrink-0 ml-2 shadow-xs">
                      <IconArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-150" />
                    </div>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Email-Only Authentication Form */}
          <form onSubmit={handleCustomSubmit} className="space-y-3 pt-2 border-t border-stone-200">
            <div>
              <label htmlFor="cvsu-email-input" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                Or Type Your CvSU Account
              </label>
              
              <div className="flex rounded-2xl border border-stone-300 bg-white overflow-hidden focus-within:ring-4 focus-within:ring-cvsu-green/10 focus-within:border-cvsu-green transition-all shadow-xs">
                <input
                  id="cvsu-email-input"
                  type="text"
                  placeholder="username or user@cvsu.edu.ph"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-4 py-3.5 text-sm text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none bg-transparent"
                />
                {!emailInput.toLowerCase().endsWith("@cvsu.edu.ph") && (
                  <span className="px-4 py-3.5 bg-[#F7F7F2] text-stone-600 font-mono text-xs font-bold border-l border-stone-200 select-none flex items-center shrink-0">
                    @cvsu.edu.ph
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !emailInput.trim()}
              className="w-full bg-cvsu-green hover:bg-cvsu-dark text-white font-extrabold py-4 px-6 rounded-full text-sm transition-all shadow-md hover:shadow-lg btn-tactile hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-3 cursor-pointer group border border-cvsu-vibrant/30"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Institutional Account...</span>
                </>
              ) : (
                <>
                  <span>Sign In as {role === "teacher" ? "Faculty" : "Student"}</span>
                  <IconArrowRight size={16} className="group-hover:translate-x-1 text-cvsu-vibrant transition-transform duration-200" />
                </>
              )}
            </button>
          </form>

          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center gap-2 view-transition">
              <span className="shrink-0 text-base leading-none">⚠️</span>
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    google?: any;
  }
}
