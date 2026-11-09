"use client";

import React, { useState } from "react";
import { UserRole } from "@/types/quiz";
import { motion, type Variants } from "framer-motion";
import { IconCvSU } from "@/components/icons";

interface Props {
  onOpenAuth: (role: UserRole) => void;
}

// ==========================================
// Custom Geometric SVGs & Icons
// ==========================================
function IconArrowRight({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconCheckMint() {
  return (
    <div className="w-5 h-5 rounded-full bg-cvsu-light border border-cvsu-green/40 flex items-center justify-center shrink-0">
      <svg className="w-3 h-3 text-cvsu-green" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5L4.8 8.8L9.5 3.5" />
      </svg>
    </div>
  );
}

function IconSparkles({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364l-2.121 2.121M7.757 16.243l-2.121 2.121m12.728 0l-2.121-2.121M7.757 7.757L5.636 5.636" />
    </svg>
  );
}

function IconShieldCheck({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconBookOpen({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

// ==========================================
// Main CvSU Quiz Hero Landing Page Component
// ==========================================
export default function LandingPage({ onOpenAuth }: Props) {
  // Interactive Live Quiz Runner Teaser State
  const [selectedDemoAnswer, setSelectedDemoAnswer] = useState<number | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Framer Motion Physics & Animation Variants
  const containerStagger: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.1,
      },
    },
  };

  const itemFadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
  };

  const springCard1: Variants = {
    hidden: { opacity: 0, scale: 0.92, y: 40, rotate: -8 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      rotate: -3,
      transition: {
        type: "spring",
        stiffness: 90,
        damping: 14,
        delay: 0.3,
      },
    },
  };

  const springCard2: Variants = {
    hidden: { opacity: 0, scale: 0.92, y: 50, rotate: 6 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      rotate: 2,
      transition: {
        type: "spring",
        stiffness: 85,
        damping: 13,
        delay: 0.45,
      },
    },
  };

  const springPill: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.9 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 120,
        damping: 12,
        delay: 0.65,
      },
    },
  };

  return (
    <div className="min-h-screen bg-cvsu-dark text-white font-sans selection:bg-cvsu-vibrant selection:text-cvsu-dark antialiased overflow-x-hidden">
      
      {/* ========================================================================= */}
      {/* SECTION A: HERO SECTION (Dark Green Background: CvSU Dark)                 */}
      {/* ========================================================================= */}
      <section className="relative bg-cvsu-dark pt-6 pb-24 sm:pb-32 overflow-hidden border-b border-white/10">
        
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute top-0 right-1/4 w-[650px] h-[450px] bg-cvsu-green/20 rounded-full blur-[120px] pointer-events-none" />

        {/* Global Navigation Header / Navbar */}
        <header className="fixed inset-x-0 top-0 z-[100] w-full px-6 sm:px-8 h-20 flex items-center justify-between border-b border-white/10 bg-cvsu-green/25 shadow-sm backdrop-blur-lg">
          
          {/* Brand Logo & Emblem */}
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onOpenAuth("student")}>
            <div className="w-10 h-10 rounded-2xl bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-200">
              <IconCvSU size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-syne text-lg tracking-tight text-cvsu-vibrant group-hover:text-cvsu-vibrant transition-colors">
                  Quiz Hero
                </span>

              </div>
              <p className="text-[11px] text-cvsu-vibrant font-medium">Cavite State University – Imus City Campus</p>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium text-white/75">
            <a
              href="#assessments"
              className="text-cvsu-vibrant hover:text-white transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-cvsu-vibrant hover:after:w-full after:transition-all after:duration-200"
            >
              Assessments
            </a>
            <a
              href="#ai-generator"
              className="text-cvsu-vibrant hover:text-white transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-cvsu-vibrant hover:after:w-full after:transition-all after:duration-200"
            >
              AI Generator
            </a>
            <button
              onClick={() => onOpenAuth("teacher")}
              className="text-cvsu-vibrant hover:text-white transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-cvsu-vibrant hover:after:w-full after:transition-all after:duration-200 cursor-pointer text-left"
            >
              Faculty Studio
            </button>
            <button
              onClick={() => onOpenAuth("teacher")}
              className="text-cvsu-vibrant hover:text-white transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-cvsu-vibrant hover:after:w-full after:transition-all after:duration-200 cursor-pointer text-left"
            >
              Question Bank
            </button>
            <a
              href="#gradebook"
              className="text-cvsu-vibrant hover:text-white transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-cvsu-vibrant hover:after:w-full after:transition-all after:duration-200"
            >
              Gradebook
            </a>
            <div className="relative">
              <button
                type="button"
                aria-expanded={isMoreMenuOpen}
                aria-haspopup="true"
                onClick={() => setIsMoreMenuOpen((open) => !open)}
                className="text-cvsu-vibrant flex items-center gap-1.5 py-1 hover:text-white transition-colors cursor-pointer"
              >
                More
                <svg className={`text-cvsu-vibrant h-3.5 w-3.5 transition-transform ${isMoreMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {isMoreMenuOpen && (
                <div className="text-cvsu-vibrant absolute right-0 top-full mt-3 w-48 rounded-2xl border border-white/15 bg-[#06281E]/95 p-2 shadow-2xl backdrop-blur-xl">
                  <a
                    href="/developers"
                    onClick={() => setIsMoreMenuOpen(false)}
                    className="block rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Developers
                  </a>
                  <a
                    href="#footer"
                    onClick={() => setIsMoreMenuOpen(false)}
                    className="block rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Contact & support
                  </a>
                </div>
              )}
            </div>
          </nav>

          {/* Right Header CTAs */}
          <div className="flex items-center gap-3">
            <div className="relative md:hidden">
              <button
                type="button"
                aria-expanded={isMoreMenuOpen}
                aria-haspopup="true"
                onClick={() => setIsMoreMenuOpen((open) => !open)}
                className="flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white transition-colors px-2 py-2 cursor-pointer"
              >
                More
                <svg className={`h-3.5 w-3.5 transition-transform ${isMoreMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {isMoreMenuOpen && (
                <div className="absolute right-0 top-full mt-3 w-44 rounded-2xl border border-white/15 bg-[#06281E]/95 p-2 shadow-2xl backdrop-blur-xl">
                  <a href="/developers" onClick={() => setIsMoreMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors">
                    Developers
                  </a>
                  <a href="#footer" onClick={() => setIsMoreMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors">
                    Contact & support
                  </a>
                </div>
              )}
            </div>
            <motion.button
              whileHover={{ y: -2, boxShadow: "0 10px 25px -5px rgba(2, 228, 155, 0.3)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpenAuth("teacher")}
              className="hidden sm:inline-block text-cvsu-vibrant hover:text-cvsu-dark font-semibold text-xs sm:text-sm rounded-full shadow-sm hover:bg-cvsu-light transition-colors px-3 py-2 cursor-pointer"
            > 
              Faculty Login
            </motion.button>
            <motion.button
              whileHover={{ y: -2, boxShadow: "0 10px 25px -5px rgba(2, 228, 155, 0.3)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpenAuth("student")}
              className="px-6 py-2.5 bg-transparent text-cvsu-vibrant hover:text-cvsu-dark font-semibold text-xs sm:text-sm rounded-full shadow-sm hover:bg-cvsu-light transition-colors cursor-pointer"
            >
              Sign In
            </motion.button>
          </div>
        </header>

        {/* Hero Content Grid */}
        <div className="max-w-7xl mx-auto px-6 sm:px-8 pt-24 sm:pt-28 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
          
          {/* Left Column: Typography & CTAs */}
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="visible"
            className="lg:col-span-6 space-y-6 sm:space-y-8"
          >
            {/* Pill Tag */}
            <motion.div variants={itemFadeUp} className="inline-flex">
              <span className="px-3 py-1.5 rounded-full bg-cvsu-vibrant text-cvsu-dark font-bold text-xs tracking-tight shadow-sm flex items-center gap-2">
                <IconSparkles className="w-3.5 h-3.5" />
                <span>Institutional AI Assessment, Reimagined</span>
              </span>
            </motion.div>

            {/* Massive H1 Headline */}
            <motion.h1
              variants={itemFadeUp}
              className="font-syne text-3xl sm:text-4xl lg:text-5xl tracking-tight text-white leading-[1.1]"
            >
              <span className="text-cvsu-vibrant">Assessments</span>{" "}
              <span className="text-cvsu-gold">that grade themselves while you teach.</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={itemFadeUp}
              className="text-base sm:text-lg text-white/75 leading-relaxed max-w-xl font-normal"
            >
              Transform lecture notes, PDFs, textbook photos, and syllabus topics into rigorous, curriculum-aligned quizzes in seconds with Gemini 3.6 Flash.
            </motion.p>

            {/* CTA Group */}
            <motion.div variants={itemFadeUp} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <motion.button
                whileHover={{ y: -2, boxShadow: "0 15px 30px -8px rgba(14, 116, 68, 0.4)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenAuth("student")}
                className="font-syne px-8 py-4 bg-cvsu-green text-cvsu-dark font-bold text-base rounded-full shadow-lg hover:bg-cvsu-gold transition-colors flex items-center justify-center gap-3 cursor-pointer group border border-cvsu-green"
              >
                <span>Enter as Student</span>
                <IconArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
              </motion.button>

              <motion.button
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenAuth("teacher")}
                className="font-syne px-6 py-4 bg-cvsu-green text-cvsu-dark hover:bg-cvsu-gold text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-cvsu-green rounded-full"
              >
                <span>Enter as Faculty</span>
                 <IconArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
              </motion.button>
            </motion.div>

            {/* Micro Trust Indicators */}
            <motion.div variants={itemFadeUp} className="pt-4 flex flex-wrap items-center gap-6 text-xs text-white/60 font-medium">
              <div className="flex items-center gap-2">
                <IconShieldCheck className="w-4 h-4 text-cvsu-vibrant" />
                <span>CvSU – Imus Campus @cvsu.edu.ph</span>
              </div>
              <div className="flex items-center gap-2">
                <IconBookOpen className="w-4 h-4 text-cvsu-vibrant" />
                <span>Anti-Tampering Score Recalculation</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column: Layered Spring Physics UI Mockup */}
          <div className="lg:col-span-6 relative min-h-[440px] sm:min-h-[500px] flex items-center justify-center">
            
            {/* 1. Academic Lecture PDF Ingestion Document (Back Layer) */}
            <motion.div
              variants={springCard1}
              initial="hidden"
              animate="visible"
              whileHover={{ y: -6, rotate: -1, transition: { duration: 0.2 } }}
              className="absolute top-2 sm:top-6 left-2 sm:left-6 z-10 w-[300px] sm:w-[350px] rounded-3xl bg-[#06281E]/95 p-6 text-white border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] cursor-pointer backdrop-blur-md space-y-4"
            >
              {/* Document Header */}
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-300 text-xs font-bold font-mono">
                    PDF
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white font-mono leading-none">Bio101_Lecture_4.pdf</p>
                    <p className="text-[10px] text-white/50 font-mono mt-0.5 leading-none">24 slides • 4.2 MB</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full bg-cvsu-vibrant/20 text-cvsu-vibrant font-semibold border border-cvsu-vibrant/30">
                  AI Extracted
                </span>
              </div>

              {/* Extracted Core Concepts */}
              <div className="space-y-2 text-xs">
                <p className="text-white/80 font-medium">
                  Topic: <strong className="text-cvsu-vibrant">Cellular Energy & Glycolysis</strong>
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {["ATP Synthase", "Krebs Cycle", "Pyruvate", "NADH"].map((tag) => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/80 font-mono border border-white/10">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Document Footer */}
              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[11px] text-white/60 font-mono">
                <span>Instructor: Dr. R. Bautista</span>
                <span className="text-cvsu-vibrant font-bold">10 Qs Ready</span>
              </div>
            </motion.div>

            {/* 2. Primary White Card: Active Interactive Assessment */}
            <motion.div
              variants={springCard2}
              initial="hidden"
              animate="visible"
              whileHover={{ y: -6, rotate: 0, transition: { duration: 0.2 } }}
              className="absolute top-28 sm:top-24 right-2 sm:right-6 z-20 w-[300px] sm:w-[350px] bg-[#FFFFFF] text-[#1C1C1C] rounded-3xl p-6 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.25)] border border-stone-200/80"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                    Question 4 of 10
                  </span>
                  <span className="block text-xs font-semibold text-cvsu-green bg-cvsu-light px-2 py-0.5 rounded-full mt-1 w-fit">
                    Multiple Choice
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-cvsu-vibrant text-cvsu-dark text-xs font-bold font-mono">
                  Score: 3/3
                </span>
              </div>

              <p className="text-xs sm:text-sm font-bold text-[#1C1C1C] leading-snug mb-3.5">
                What is the primary net ATP yield generated per glucose molecule during glycolysis?
              </p>

              {/* Multiple Choice Preview Options */}
              <div className="space-y-1.5 text-xs">
                {[
                  { text: "36 to 38 ATP Molecules", correct: false },
                  { text: "2 Net ATP Molecules", correct: true },
                  { text: "4 Net ATP Molecules", correct: false },
                ].map((opt, oidx) => (
                  <div
                    key={oidx}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                      opt.correct
                        ? "bg-cvsu-light border-cvsu-green text-cvsu-dark font-bold"
                        : "bg-[#F7F7F2] border-stone-200 text-stone-700"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-white border border-stone-300 flex items-center justify-center text-[10px] font-mono">
                        {String.fromCharCode(65 + oidx)}
                      </span>
                      {opt.text}
                    </span>
                    {opt.correct && <span className="text-cvsu-green font-bold text-[11px]">✓ Correct</span>}
                  </div>
                ))}
              </div>

              {/* Class Mastery Metric */}
              <div className="pt-3 mt-3 border-t border-stone-100 flex justify-between items-center text-[11px] text-stone-500">
                <span>Class Average Mastery:</span>
                <strong className="text-cvsu-green font-mono font-bold">88.4% passing</strong>
              </div>
            </motion.div>

            {/* 3. Floating Alert Pill (AI Multimodal Notification) */}
            <motion.div
              variants={springPill}
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.03 }}
              className="absolute -bottom-4 sm:bottom-2 left-6 sm:left-12 z-30 bg-[#FFFFFF] rounded-full px-4 py-2.5 shadow-[0_20px_35px_-8px_rgba(0,0,0,0.3)] border border-stone-200 flex items-center gap-3 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center shrink-0">
                <IconSparkles className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs text-[#1C1C1C]">
                <span className="font-bold text-cvsu-green">AI Quiz Generated:</span>{" "}
                <span className="font-medium">10 Questions from PDF Lecture</span>{" "}
                <span className="text-stone-400 font-mono text-[10px]">• 1m ago</span>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION B: FEATURE SECTION 1 (Light Cream Background: #F7F7F2)            */}
      {/* ========================================================================= */}
      <section className="bg-[#F7F7F2] text-[#1C1C1C] py-18 sm:py-28 border-b border-stone-300/60 relative" id="assessments">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="space-y-6"
          >
            {/* Section Tag */}
            <div className="inline-flex">
              <span className="px-4 py-1.5 rounded-full bg-cvsu-light text-cvsu-green border border-cvsu-green/30 font-bold text-xs tracking-tight shadow-xs">
                Curriculum-Aligned AI Assessment
              </span>
            </div>

            {/* Massive Bold Statement */}
            <h2 className="font-syne text-2xl sm:text-3xl lg:text-4xl tracking-tight text-[#1C1C1C] leading-[1.15]">
              Generate quizzes for Imus Campus students, evaluate responses in real-time, and track institutional mastery.
            </h2>

            <p className="text-base sm:text-lg text-stone-600 leading-relaxed max-w-3xl font-normal pt-2">
              Say goodbye to hours of manual question drafting, paper grading, and spreadsheet tallying. Quiz Hero turns syllabus topics and multimodal slides into automated, server-verified tests with instant semantic grading.
            </p>
          </motion.div>

          {/* Three Metric Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-16">
            {[
              { stat: "100%", label: "Automatic & Semantic Grading", desc: "Instant AI evaluation for multiple-choice, true/false, and open-ended items." },
              { stat: "< 2.4s", label: "Quiz Generation Speed", desc: "Powered by Google Gemini 3.6 Flash with structured schema guarantees." },
              { stat: "4 Formats", label: "Multi-Format Question Suite", desc: "Multiple Choice, True or False, Identification, and Open-Ended questions." },
            ].map((metric, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                whileHover={{ y: -4, boxShadow: "0 20px 40px -15px rgba(0,0,0,0.08)" }}
                className="p-8 rounded-3xl bg-white border border-stone-200/80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.04)] space-y-2 transition-all"
              >
                <div className="text-2xl sm:text-3xl font-black text-cvsu-green tracking-tight font-mono">
                  {metric.stat}
                </div>
                <div className="text-sm font-bold text-[#1C1C1C]">{metric.label}</div>
                <div className="text-xs text-stone-500 leading-relaxed">{metric.desc}</div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION C: FEATURE SECTION 2 (Split Bento Box on Light Cream: #F7F7F2)    */}
      {/* ========================================================================= */}
      <section className="bg-[#F7F7F2] text-[#1C1C1C] py-20 sm:py-28 border-b border-stone-300/60" id="ai-generator">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Side: Content & Bullet List with Mint Checkmarks */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="lg:col-span-5 space-y-6"
          >
            <div className="inline-flex">
              <span className="px-4 py-1.5 rounded-full bg-cvsu-green text-white font-bold text-xs tracking-tight">
                Multimodal AI Assessment Studio
              </span>
            </div>

            <h3 className="font-syne text-2xl sm:text-3xl lg:text-4xl tracking-tight text-cvsu-vibrant leading-tight">
              Every format, already mastered.
            </h3>

            <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
              Upload textbook photos, syllabus PDFs, or raw lecture notes. Our AI analyzes the core concepts and drafts balanced, cheat-resistant assessment sets.
            </p>

            {/* Custom Mint Checkmark Bullet List */}
            <div className="space-y-3.5 pt-2">
              {[
                "Direct PDF syllabus and lecture slide extraction",
                "Textbook photo and diagram OCR to multiple-choice items",
                "Fuzzy string normalization & semantic AI answer evaluation",
                "Anti-tampering server-side score recalculation on submission",
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <IconCheckMint />
                  <span className="text-xs sm:text-sm font-semibold text-stone-800">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right Side: Interactive Live Quiz Teaser Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="lg:col-span-7"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_25px_50px_-15px_rgba(0,0,0,0.1)] border border-stone-200 space-y-6">
              
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-stone-100">
                <div>
                  <h4 className="font-syne text-base text-[#1C1C1C]">Interactive Assessment Preview</h4>
                  <p className="text-xs text-stone-500">Try answering this live sample question</p>
                </div>
                <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-cvsu-light text-cvsu-green border border-cvsu-green/30 text-xs font-mono font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cvsu-green animate-pulse" />
                  Live Runner
                </span>
              </div>

              {/* Sample Question Box */}
              <div className="p-5 rounded-2xl bg-[#F7F7F2] border border-stone-200/90 space-y-4">
                <div className="flex justify-between items-center text-xs text-stone-500 font-semibold">
                  <span>General Biology • Question 1 of 5</span>
                  <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 font-mono">Multiple Choice</span>
                </div>

                <p className="text-base font-bold text-[#1C1C1C]">
                  Which organelle is responsible for synthesizing ribosomal RNA (rRNA) in eukaryotic cells?
                </p>

                {/* Choices */}
                <div className="space-y-2">
                  {[
                    { text: "Endoplasmic Reticulum", correct: false },
                    { text: "Nucleolus", correct: true },
                    { text: "Golgi Apparatus", correct: false },
                    { text: "Mitochondria", correct: false },
                  ].map((choice, cidx) => {
                    const isSelected = selectedDemoAnswer === cidx;
                    const isCorrect = choice.correct;
                    const showFeedback = selectedDemoAnswer !== null;

                    return (
                      <motion.button
                        key={cidx}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedDemoAnswer(cidx)}
                        className={`w-full text-left p-3.5 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${
                          showFeedback
                            ? isCorrect
                              ? "bg-cvsu-light border-cvsu-green text-cvsu-dark font-bold"
                              : isSelected
                              ? "bg-red-50 border-red-300 text-red-900"
                              : "bg-white border-stone-200 text-stone-500"
                            : "bg-white hover:bg-cvsu-light/50 border-stone-200 hover:border-cvsu-green text-stone-800"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                            showFeedback && isCorrect
                              ? "bg-cvsu-green text-white"
                              : "bg-stone-100 text-stone-600 border border-stone-300"
                          }`}>
                            {String.fromCharCode(65 + cidx)}
                          </span>
                          {choice.text}
                        </span>

                        {showFeedback && isCorrect && (
                          <span className="text-cvsu-green font-bold text-xs">✓ Correct</span>
                        )}
                        {showFeedback && isSelected && !isCorrect && (
                          <span className="text-red-600 font-bold text-xs">✗ Incorrect</span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {selectedDemoAnswer !== null && (
                  <div className="pt-2 text-xs text-stone-600 flex items-center justify-between">
                    <span>Selected: <strong>Option {String.fromCharCode(65 + selectedDemoAnswer)}</strong></span>
                    <button
                      onClick={() => setSelectedDemoAnswer(null)}
                      className="text-cvsu-green font-bold underline hover:text-cvsu-dark cursor-pointer"
                    >
                      Reset question
                    </button>
                  </div>
                )}
              </div>

            </div>
          </motion.div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION D: FEATURE SECTION 3 (Dark Green Background: CvSU Dark)           */}
      {/* ========================================================================= */}
      <section className="bg-cvsu-dark text-white py-24 sm:py-32 border-b border-white/10 relative overflow-hidden" id="gradebook">
        
        {/* Subtle Ambient Radial Highlight */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-cvsu-green/20 rounded-full blur-[140px] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 sm:px-8 relative z-10 space-y-16">
          
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-4 max-w-2xl mx-auto"
          >
            <div className="inline-flex">
              <span className="px-4 py-1.5 rounded-full bg-cvsu-vibrant text-cvsu-dark font-bold text-xs tracking-tight">
                Institutional Gradebook & Analytics
              </span>
            </div>
            <h3 className="font-syne text-2xl sm:text-3xl lg:text-4xl tracking-tight text-cvsu-gold leading-tight">
              Real-Time Class Performance
            </h3>
            <p className="text-sm sm:text-base text-white/70">
              Track student comprehension, identify difficult topics, and export verified records instantly with CSV reports.
            </p>
          </motion.div>

          {/* Interactive Gradebook Table Card Component */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto bg-white text-[#1C1C1C] rounded-3xl p-6 sm:p-8 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] border border-white/20 space-y-6"
          >
            <div className="flex justify-between items-center pb-4 border-b border-stone-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Live Faculty Gradebook</span>
                <p className="text-xs text-stone-400">Class: BS Computer Science 3A</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-cvsu-light text-cvsu-dark font-mono text-xs font-bold border border-cvsu-green/30">
                100% Verified Server-Side
              </span>
            </div>

            {/* Sample Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F7F2] text-stone-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-3 rounded-l-xl">Student Name</th>
                    <th className="p-3">Topic</th>
                    <th className="p-3">Score</th>
                    <th className="p-3 rounded-r-xl">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {[
                    { name: "Juan Dela Cruz", email: "juan.delacruz@cvsu.edu.ph", topic: "Photosynthesis", score: "10/10", pct: 100 },
                    { name: "Maria Santos", email: "maria.santos@cvsu.edu.ph", topic: "Cellular Respiration", score: "9/10", pct: 90 },
                    { name: "Angelo Reyes", email: "a.reyes@cvsu.edu.ph", topic: "Genetics & DNA", score: "8/10", pct: 80 },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-stone-50/70 transition-colors">
                      <td className="p-3">
                        <p className="font-bold text-stone-900">{row.name}</p>
                        <p className="font-mono text-[10px] text-stone-400">{row.email}</p>
                      </td>
                      <td className="p-3 text-stone-700 font-medium">{row.topic}</td>
                      <td className="p-3 font-mono font-bold text-stone-900">{row.score}</td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-full bg-cvsu-light text-cvsu-green font-mono font-bold text-[11px] border border-cvsu-green/20">
                          {row.pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Row */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-500 font-medium">
              <span>Security status: <strong className="text-cvsu-green">Anti-Tamper Cryptographic Check Active</strong></span>
              <span className="text-cvsu-vibrant font-bold">CSV One-Click Export Ready</span>
            </div>
          </motion.div>

          {/* Three Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 text-center">
            {[
              { stat: "Zero Grading Lag", desc: "Results computed the instant a student answers, with itemized answer reviews." },
              { stat: "Role Verification", desc: "Restricted to institutional @cvsu.edu.ph Google accounts and student credentials." },
              { stat: "Fuzzy Logic OCR", desc: "Normalizes student capitalization, whitespace, and leading articles in text answers." },
            ].map((s, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xs space-y-2"
              >
                <div className="text-2xl sm:text-3xl font-black text-cvsu-gold font-mono">{s.stat}</div>
                <p className="text-xs text-white/70 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION E: FINAL CTA & FOOTER (Dark Green Background: CvSU Dark)           */}
      {/* ========================================================================= */}
      <section id="footer" className="bg-cvsu-dark text-white pt-24 pb-16 relative overflow-hidden">
        
        {/* Main CTA Block */}
        <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center space-y-8 pb-24 border-b border-white/10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <span className="px-4 py-1.5 rounded-full bg-cvsu-vibrant text-cvsu-dark font-bold text-xs tracking-tight">
              Ready to Upgrade Your Classroom?
            </span>

            <h2 className="font-syne text-xl sm:text-3xl lg:text-6xl tracking-tight text-white leading-tight">
              Finals are coming. This time, be ready.
            </h2>

            <p className="text-base sm:text-lg text-white/75 max-w-xl mx-auto leading-relaxed">
              Join Cavite State University faculty and students delivering cheat-resistant, instant AI assessments.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <motion.button
                whileHover={{ y: -2, boxShadow: "0 15px 30px -8px rgba(14, 116, 68, 0.4)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenAuth("student")}
                className="w-full sm:w-auto px-9 py-4 bg-cvsu-green text-cvsu-dark font-bold text-base rounded-full shadow-lg hover:bg-cvsu-gold transition-colors cursor-pointer border border-cvsu-green"
              >
                Enter as Student
              </motion.button>

              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenAuth("teacher")}
                className="w-full sm:w-auto px-8 py-4 bg-cvsu-green hover:bg-cvsu-gold text-cvsu-dark font-semibold text-base rounded-full border border-cvsu-green transition-colors cursor-pointer"
              >
                Enter as Faculty
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Multi-Column Global Footer */}
        <footer className="max-w-7xl mx-auto px-6 sm:px-8 pt-16 grid grid-cols-2 md:grid-cols-5 gap-8 text-xs text-white/60">
          
          {/* Col 1: Brand */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center">
                <IconCvSU size={18} />
              </div>
              <span className="font-syne text-base tracking-tight text-white">Quiz Hero</span>
            </div>
            <p className="text-xs text-white/60 max-w-sm leading-relaxed">
              Cavite State University – Imus Campus AI-powered assessment generation, semantic grading, and student analytics suite.
            </p>
            <div className="pt-2 text-[11px] text-white/40 font-mono">
              Cavite State University • Imus Campus, Cavite
            </div>
          </div>

          {/* Col 2: Assessments */}
          <div className="space-y-3">
            <h5 className="font-bold text-white text-xs uppercase tracking-wider">Assessment</h5>
            <ul className="space-y-2">
              {["Multiple Choice", "True or False", "Identification", "Open-Ended Evaluation", "Topic Explorer"].map((l) => (
                <li key={l}>
                  <button onClick={() => onOpenAuth("student")} className="hover:text-white transition-colors cursor-pointer text-left">
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Faculty */}
          <div className="space-y-3">
            <h5 className="font-bold text-white text-xs uppercase tracking-wider">Faculty</h5>
            <ul className="space-y-2">
              {["PDF Syllabus Ingestion", "Textbook Photo OCR", "Class Gradebook", "CSV Export", "Anti-Tamper Security"].map((l) => (
                <li key={l}>
                  <button onClick={() => onOpenAuth("teacher")} className="hover:text-white transition-colors cursor-pointer text-left">
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Institutional */}
          <div className="space-y-3">
            <h5 className="font-bold text-white text-xs uppercase tracking-wider">Institutional</h5>
            <ul className="space-y-2">
              {["CvSU Portal Access", "Google Workspace SSO", "Academic Integrity", "Student Support", "Help & Docs"].map((l) => (
                <li key={l}>
                  <button onClick={() => onOpenAuth("student")} className="hover:text-white transition-colors cursor-pointer text-left">
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </div>

        </footer>

        {/* Bottom Disclaimers */}
        <div className="max-w-7xl mx-auto px-6 sm:px-8 pt-12 mt-12 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-white/40 font-mono">
          <p>© {new Date().getFullYear()} Cavite State University. All rights reserved.</p>
          <p>Powered by Gemini 3.6 Flash & Quiz Hero AI Assessment Engine.</p>
        </div>

      </section>

    </div>
  );
}
