"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { CvSUUser } from "@/types/quiz";
import { fetchCurrentUser, ApiError } from "@/lib/api";

interface AuthContextType {
  user: CvSUUser | null;
  token: string | null;
  login: (user: CvSUUser, token: string) => void;
  logout: () => void;
  isLoaded: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CvSUUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = localStorage.getItem("cvsu_token");
      if (!storedToken) {
        setIsLoaded(true);
        return;
      }

      try {
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
        setToken(storedToken);
        localStorage.setItem("cvsu_user", JSON.stringify(currentUser));
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 401 || status === 403) {
          localStorage.removeItem("cvsu_user");
          localStorage.removeItem("cvsu_token");
        }
        // Transient/network errors keep session intact.
      } finally {
        setIsLoaded(true);
      }
    };

    void restoreSession();
  }, []);

  const login = (newUser: CvSUUser, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem("cvsu_user", JSON.stringify(newUser));
    localStorage.setItem("cvsu_token", newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("cvsu_user");
    localStorage.removeItem("cvsu_token");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoaded }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
