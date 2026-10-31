"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@/types/quiz";
import { useAuth } from "@/lib/auth/AuthContext";
import LandingPage from "@/components/shared/LandingPage";
import CvSUAuthModal from "@/components/shared/CvSUAuthModal";
import AIChatbot from "@/components/shared/AIChatbot";

export default function Home() {
  const { user, login, isLoaded } = useAuth();
  const router = useRouter();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInitialRole, setAuthInitialRole] = useState<UserRole>("student");

  useEffect(() => {
    if (isLoaded && user) {
      if (user.role?.toLowerCase() === "teacher") {
        router.push("/studio");
      } else {
        router.push("/dashboard");
      }
    }
  }, [user, isLoaded, router]);

  const handleLoginSuccess = (authenticatedUser: any) => {
    login(authenticatedUser, authenticatedUser.token);
    setShowAuthModal(false);
    if (authenticatedUser.role?.toLowerCase() === "teacher") {
      router.push("/studio");
    } else {
      router.push("/dashboard");
    }
  };

  const handleOpenAuth = (role: UserRole) => {
    setAuthInitialRole(role);
    setShowAuthModal(true);
  };

  if (!isLoaded || user) {
    return <div className="min-h-screen bg-[#F7F7F2]" />;
  }

  return (
    <div className="view-transition relative">
      <LandingPage onOpenAuth={handleOpenAuth} />
      {showAuthModal && (
        <CvSUAuthModal
          initialRole={authInitialRole}
          onLoginSuccess={handleLoginSuccess}
          onClose={() => setShowAuthModal(false)}
        />
      )}
      <AIChatbot currentUser={null} />
    </div>
  );
}
