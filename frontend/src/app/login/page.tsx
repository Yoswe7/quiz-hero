"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/lib/auth/AuthContext";
import { authenticateCvSUGoogle, authenticateLocalTestStudent, ApiError } from "@/lib/api";
import { AuthMode } from "@/types/quiz";
import { AuthView } from "@/components/auth/AuthView";

interface LoginPageProps {
  showDevBypass?: boolean;
}

export default function LoginPage({ showDevBypass = false }: LoginPageProps) {
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
  
  const localTestAuthEnabled = showDevBypass;
    
  const handleLocalTestLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      const authUser = await authenticateLocalTestStudent();
      if (!authUser.token) {
        throw new Error("Missing local test session token.");
      }
      login(authUser, authUser.token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Local test login failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthView
      mode={authMode}
      role={selectedRole}
      onRoleChange={(r) => {
        setSelectedRole(r);
        setError("");
      }}
      onModeChange={(m) => {
        setAuthMode(m);
        setError("");
        setInfoNotice("");
      }}
    >
      {/* Seamless 404 Transition Notice Banner */}
      {infoNotice && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-medium space-y-1">
          <p className="font-bold">Account Verified via Google</p>
          <p>{infoNotice}</p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-start gap-2">
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
          <div className="w-8 h-8 border-3 border-[#0b3126]/20 border-t-[#0b3126] rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-600">
            Verifying institutional credentials...
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Local Developer Test Account Bypass (Only if enabled or on /login/developers) */}
          {localTestAuthEnabled && (
            <button
              type="button"
              onClick={handleLocalTestLogin}
              className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100 cursor-pointer"
            >
              Use local student test account
            </button>
          )}

          {/* Teacher Code Input if Teacher is selected during Signup */}
          {authMode === "signup" && selectedRole === "TEACHER" && (
            <div className="space-y-2 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-left">
              <div className="flex items-center justify-between">
                <label htmlFor="faculty-code" className="text-xs font-bold text-amber-950">
                  Faculty Verification Code
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
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0b3126] text-slate-800"
              />
            </div>
          )}

          {/* Google Login Trigger */}
          {cachedCredential && authMode === "signup" ? (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleCompleteRegistration}
                disabled={isFacultyCodeMissing}
                className="w-full py-3.5 px-4 bg-[#0b3126] hover:bg-[#07241d] text-white font-bold text-xs sm:text-sm rounded-full shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Complete Registration
              </button>
              {isFacultyCodeMissing && (
                <p className="text-center text-[11px] text-amber-700 font-medium">
                  Please enter your Faculty Verification Code above to enable registration.
                </p>
              )}
            </div>
          ) : (
            <div>
              {isFacultyCodeMissing && (
                <p className="text-center text-[11px] text-amber-700 font-medium mb-2">
                  Please enter your Faculty Verification Code above to enable Google registration.
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

          {/* Security Policy Reminder */}
          <div className="pt-2 text-center space-y-1 border-t border-slate-100">
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <svg className="w-3.5 h-3.5 text-[#0b3126]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Real-time OAuth 2.0 Hosted Domain Enforcement</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Personal Gmail accounts (@gmail.com) and unauthorized domains are rejected.
            </p>
          </div>
        </div>
      )}
    </AuthView>
  );
}