"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/lib/auth/AuthContext";
import { authenticateCvSUGoogle, ApiError } from "@/lib/api";
import { AuthMode, UserRole } from "@/types/quiz";

export default function LoginPage() {
  const router = useRouter();
  const { user, login, isLoaded } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [selectedRole, setSelectedRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [facultyCode, setFacultyCode] = useState<string>("");
  const [cachedCredential, setCachedCredential] = useState<string | null>(null);

  const [error, setError] = useState<string>("");
  const [infoNotice, setInfoNotice] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // If already logged in, route automatically
  useEffect(() => {
    if (isLoaded && user) {
      const isTeacher = user.role?.toLowerCase() === "teacher";
      router.replace(isTeacher ? "/studio" : "/dashboard");
    }
  }, [user, isLoaded, router]);

  const executeAuth = async (
    credential: string,
    mode: AuthMode,
    role?: "STUDENT" | "TEACHER",
    code?: string
  ) => {
    setIsLoading(true);
    setError("");

    try {
      const authUser = await authenticateCvSUGoogle({
        credential,
        auth_mode: mode,
        requested_role: role,
        faculty_code: code,
      });

      if (!authUser.token) {
        throw new Error("Missing session token from institutional authentication service.");
      }

      login(authUser, authUser.token);

      const isTeacher = authUser.role?.toLowerCase() === "teacher";
      router.push(isTeacher ? "/studio" : "/dashboard");
    } catch (err: unknown) {
      const status = (err as ApiError)?.status;
      const msg = err instanceof Error ? err.message : "Authentication failed.";

      // Seamless 404 Recovery: Auto-switch to Sign Up with cached token
      if (mode === "signin" && status === 404) {
        setCachedCredential(credential);
        setAuthMode("signup");
        setInfoNotice(
          "Almost done! We verified your CvSU Google account—select your role below to complete registration."
        );
        setError("");
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError("No Google credential returned. Please try again.");
      return;
    }

    if (authMode === "signup" && selectedRole === "TEACHER" && !facultyCode.trim()) {
      setError("Please enter your official Faculty Verification Code before registering as faculty.");
      return;
    }

    await executeAuth(
      credentialResponse.credential,
      authMode,
      authMode === "signup" ? selectedRole : undefined,
      authMode === "signup" && selectedRole === "TEACHER" ? facultyCode.trim() : undefined
    );
  };

  const handleCompleteRegistration = async () => {
    if (!cachedCredential) return;

    if (selectedRole === "TEACHER" && !facultyCode.trim()) {
      setError("Please enter your official Faculty Verification Code before registering as faculty.");
      return;
    }

    await executeAuth(
      cachedCredential,
      "signup",
      selectedRole,
      selectedRole === "TEACHER" ? facultyCode.trim() : undefined
    );
  };

  const handleGoogleError = () => {
    setError("Google Sign-In failed or was cancelled. Please select your official @cvsu.edu.ph account.");
  };

  const isFacultyCodeMissing =
    authMode === "signup" && selectedRole === "TEACHER" && facultyCode.trim().length === 0;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Decorative Brand Header Accents */}
      <div className="w-full max-w-md mb-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#14532d]/10 text-[#14532d] text-xs font-bold uppercase tracking-wider mb-3 border border-[#14532d]/20">
          <span className="w-2 h-2 rounded-full bg-[#eab308]" />
          Cavite State University
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532d] tracking-tight">
          CvSU Quiz Hero
        </h1>
        <p className="text-sm text-slate-600 mt-1 font-medium">
          Official Academic Assessment & Spaced-Repetition Platform
        </p>
      </div>

      {/* Main Authentication Card Surface (#ffffff) */}
      <div className="w-full max-w-md bg-[#ffffff] rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden">
        {/* Institutional Color Banner */}
        <div className="h-2 bg-gradient-to-r from-[#14532d] via-[#14532d] to-[#eab308]" />

        <div className="p-6 sm:p-8 space-y-5">
          {/* Top Segmented Tab Control */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setAuthMode("signin");
                setError("");
                setInfoNotice("");
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                authMode === "signin"
                  ? "bg-white text-[#14532d] shadow-sm border border-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🔑 Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setError("");
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                authMode === "signup"
                  ? "bg-[#14532d] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ✨ Create Account
            </button>
          </div>

          {/* Dynamic Tab Header */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-slate-900">
              {authMode === "signin" ? "Welcome Back • CvSU Quiz Hero" : "Create Your Account • CvSU Quiz Hero"}
            </h2>
            <p className="text-xs text-slate-500">
              {authMode === "signin"
                ? "Sign in with your registered @cvsu.edu.ph Google Workspace account"
                : "Select your role to initialize your academic workspace"}
            </p>
          </div>

          {/* Seamless 404 Transition Notice Banner */}
          {infoNotice && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-medium space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                <span>✅</span>
                <span>Account Verified via Google</span>
              </div>
              <p>{infoNotice}</p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-bold">Authentication Notice</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-[#14532d]/20 border-t-[#14532d] rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-600">
                Verifying institutional Google credentials...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sign Up Mode: Role Selector & Faculty Verification Code */}
              {authMode === "signup" && (
                <div className="space-y-2.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Select Account Role
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRole("STUDENT");
                        setError("");
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        selectedRole === "STUDENT"
                          ? "bg-white text-[#14532d] shadow-sm border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <span>🎓</span>
                      <span>Student</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRole("TEACHER");
                        setError("");
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        selectedRole === "TEACHER"
                          ? "bg-[#14532d] text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <span>👨‍🏫</span>
                      <span>Faculty / Teacher</span>
                    </button>
                  </div>

                  {/* Role Guidance / Access Code Card */}
                  {selectedRole === "STUDENT" ? (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-emerald-900 text-xs flex items-center gap-2">
                      <span className="text-base shrink-0">🎓</span>
                      <p className="leading-snug">
                        <span className="font-bold">Student Account:</span> 1-Click instant registration for taking quizzes and review.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                      <div className="flex items-center justify-between">
                        <label htmlFor="faculty-code" className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                          <span>🔑</span>
                          <span>Faculty Verification Code</span>
                        </label>
                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider bg-amber-100/80 px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      </div>
                      <input
                        id="faculty-code"
                        type="password"
                        value={facultyCode}
                        onChange={(e) => {
                          setFacultyCode(e.target.value);
                          if (error) setError("");
                        }}
                        placeholder="Enter department verification code"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532d] text-slate-800 placeholder:text-slate-400 placeholder:font-sans"
                      />
                      <p className="text-[11px] text-amber-800/90 leading-tight">
                        Enter the institutional code provided by your department.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Primary Action: Cached Credential (Zero Double Popup) or Google Login */}
              {cachedCredential && authMode === "signup" ? (
                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCompleteRegistration}
                    disabled={isFacultyCodeMissing}
                    className="w-full py-3 px-4 bg-[#14532d] hover:bg-[#14532d]/90 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>✨</span>
                    <span>Complete Registration</span>
                  </button>

                  {isFacultyCodeMissing && (
                    <p className="text-center text-[11px] text-amber-700 font-medium">
                      ⚠️ Please enter your Faculty Verification Code above to enable registration.
                    </p>
                  )}

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setCachedCredential(null);
                        setInfoNotice("");
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      Use a different Google account
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium space-y-1.5 text-left">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <span>⚠️</span>
                        <span>Google Client ID Configuration Needed</span>
                      </div>
                      <p className="text-slate-600">
                        Please add your Google OAuth Client ID to <code className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 font-mono text-[11px]">frontend/.env.local</code>.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {isFacultyCodeMissing && (
                        <p className="text-center text-[11px] text-amber-700 font-medium mb-2">
                          ⚠️ Please enter your Faculty Verification Code above to enable Google registration.
                        </p>
                      )}
                      <div
                        className={`flex justify-center w-full transition-opacity ${
                          isFacultyCodeMissing ? "pointer-events-none opacity-50 select-none" : ""
                        }`}
                      >
                        <GoogleLogin
                          onSuccess={handleGoogleSuccess}
                          onError={handleGoogleError}
                          hosted_domain="cvsu.edu.ph"
                          theme="outline"
                          size="large"
                          text={authMode === "signup" ? "signup_with" : "continue_with"}
                          shape="rectangular"
                          width="360"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Mode Switch Links */}
              <div className="pt-3 text-center border-t border-slate-100">
                {authMode === "signin" ? (
                  <p className="text-xs text-slate-600">
                    Don&apos;t have an account yet?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("signup");
                        setError("");
                      }}
                      className="font-bold text-[#14532d] hover:underline cursor-pointer"
                    >
                      Create an Account
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">
                    Already registered?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("signin");
                        setCachedCredential(null);
                        setInfoNotice("");
                        setError("");
                      }}
                      className="font-bold text-[#14532d] hover:underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  </p>
                )}
              </div>

              {/* Security Policy Notice */}
              <div className="pt-2 text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <svg className="w-3.5 h-3.5 text-[#14532d]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Real-time OAuth 2.0 Hosted Domain Enforcement</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Personal Gmail accounts (@gmail.com) and unauthorized domains are rejected.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Branding */}
      <footer className="mt-8 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} Cavite State University &bull; Software Engineering Assessment Platform
      </footer>
    </div>
  );
}
