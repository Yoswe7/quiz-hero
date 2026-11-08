import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CvSU Quiz Hero — Academic Assessment Platform",
  description:
    "Official Cavite State University interactive assessment platform. Structured quiz generation, AI-assisted evaluation, and institutional gradebook management.",
  applicationName: "Quiz Hero",
  authors: [{ name: "Cavite State University" }],
  keywords: ["CvSU", "Quiz Hero", "Assessment", "Cavite State University", "Education"],
  icons: {
    icon: "/quiz-hero-logo.png",
    shortcut: "/quiz-hero-logo.png",
    apple: "/quiz-hero-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#14532d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} antialiased`}>
      <body className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
