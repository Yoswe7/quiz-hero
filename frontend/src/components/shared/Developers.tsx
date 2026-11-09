"use client";

import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { motion } from "framer-motion";
import { useState } from "react";
import { IconCvSU } from "@/components/icons";
import altheaPhoto from "@/app/developers/althea.jpg";
/*import andreiPhoto from "@/app/developers/andrei.jpg";
import joshPhoto from "@app/developers/josh.jpg";*/

function DeveloperPhoto({
  name,
  initials,
  photo,
}: {
  name: string;
  initials: string;
  photo?: string | StaticImageData;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative flex h-22 w-22 items-center justify-center overflow-hidden rounded-full border-4 border-cvsu-light bg-cvsu-light text-2xl font-bold text-cvsu-dark shadow-[0_0_0_1px_rgba(187,204,102,0.45)]">
      {!photo || hasError ? (
        initials
      ) : (
        <Image
          src={photo}
          alt={`${name} profile`}
          fill
          sizes="96px"
          className="object-cover"
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}

const developers = [
  {
    initials: "AN",
    name: "Althea Nicole Kabigting",
    photo: altheaPhoto,
    role: "UI/UX & Frontend Developer",
    description:
      "Shapes the interface and makes each part of Quiz Hero feel simple to use, from the first click to the final result.",
  },
  {
    initials: "SE",
    name: "Sean Andrei Emralino",
    /*photo: andreiPhoto,*/
    role: "Documentation",
    description:
      "Helps turn the team’s ideas into a clear, consistent experience that feels natural for students and faculty.",
  },
  {
    initials: "JG",
    name: "Joshua Gabriel Tejada",
    /*photo: joshPhoto,*/
    role: "Backend Developer",
    description:
      "Works behind the scenes on the systems that keep quiz generation, grading, and academic records running smoothly.",
  },
];

export default function Developers() {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[100] flex h-20 w-full items-center justify-between border-b border-white/10 bg-cvsu-green/25 px-6 shadow-sm backdrop-blur-lg sm:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cvsu-vibrant text-cvsu-dark shadow-sm transition-transform duration-200 group-hover:scale-105">
            <IconCvSU size={22} />
          </div>
          <div>
            <span className="font-syne text-lg tracking-tight text-cvsu-vibrant transition-colors group-hover:text-cvsu-vibrant">
              Quiz Hero
            </span>
            <p className="text-[11px] font-medium text-cvsu-vibrant">
              Cavite State University – Imus City Campus
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-white/75 md:flex lg:gap-8">
          {[
            ["Assessments", "/#assessments"],
            ["AI Generator", "/#ai-generator"],
            ["Faculty Studio", "/login"],
            ["Question Bank", "/login"],
            ["Gradebook", "/#gradebook"],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="relative py-1 text-cvsu-vibrant transition-colors after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-cvsu-vibrant after:transition-all after:duration-200 hover:text-white hover:after:w-full"
            >
              {label}
            </Link>
          ))}
          <div className="relative">
            <button
              type="button"
              aria-expanded={isMoreMenuOpen}
              aria-haspopup="true"
              onClick={() => setIsMoreMenuOpen((open) => !open)}
              className="flex items-center gap-1.5 py-1 text-cvsu-vibrant transition-colors hover:text-white"
            >
              More
              <span className={`transition-transform ${isMoreMenuOpen ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {isMoreMenuOpen && (
              <div className="absolute right-0 top-full mt-3 w-48 rounded-2xl border border-white/15 bg-[#06281E]/95 p-2 text-cvsu-vibrant shadow-2xl backdrop-blur-xl">
                <Link
                  href="/developers"
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Developers
                </Link>
                <Link
                  href="/#footer"
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Contact & support
                </Link>
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          <div className="relative md:hidden">
            <button
              type="button"
              aria-expanded={isMoreMenuOpen}
              aria-haspopup="true"
              onClick={() => setIsMoreMenuOpen((open) => !open)}
              className="px-2 py-2 text-xs font-semibold text-white/80 transition-colors hover:text-white"
            >
              More <span className={`inline-block transition-transform ${isMoreMenuOpen ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {isMoreMenuOpen && (
              <div className="absolute right-0 top-full mt-3 w-44 rounded-2xl border border-white/15 bg-[#06281E]/95 p-2 shadow-2xl backdrop-blur-xl">
                <Link href="/developers" onClick={() => setIsMoreMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                  Developers
                </Link>
                <Link href="/#footer" onClick={() => setIsMoreMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                  Contact & support
                </Link>
              </div>
            )}
          </div>
          <Link href="/login" className="hidden rounded-full px-3 py-2 text-xs font-semibold text-cvsu-vibrant transition-colors hover:bg-cvsu-light hover:text-cvsu-dark sm:inline-block">
            Faculty Login
          </Link>
          <Link href="/login" className="rounded-full border border-cvsu-vibrant px-6 py-2.5 text-xs font-semibold text-cvsu-vibrant transition-colors hover:bg-cvsu-vibrant hover:text-cvsu-dark">
            Sign In
          </Link>
        </div>
      </header>

      <main className="min-h-screen bg-[#fbfcff] pt-20 text-[#14213d]">
        <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef6df_0%,#f7faef_38%,#fbfcff_70%)] px-6 py-24 sm:px-8 sm:py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_50%_4%,rgba(137,150,74,0.28)_0%,rgba(163,230,194,0.18)_30%,rgba(247,250,239,0)_72%)]" />
        <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-cvsu-vibrant/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-20 h-80 w-80 rounded-full bg-cvsu-green/15 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl space-y-4 text-center"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66758c]">
              The people behind it
            </span>
            <h1 className="font-syne text-2xl leading-tight tracking-tight sm:text-5xl">
              The team behind{" "}
              <em className="font-serif font-normal text-cvsu-green">Quiz Hero</em>
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-[#6b7b91] sm:text-base">
              Students who designed, built, and continue to improve a more thoughtful way to create and take assessments.
            </p>
          </motion.div>

          <div className="mt-6 flex items-end justify-between border-b border-[#dce5f0] pb-3">
            <div>
            </div>
            <p className="text-sm font-medium text-[#6b7b91]">
              <strong className="text-[#14213d]">{developers.length}</strong> Members
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {developers.map((developer, index) => (
              <motion.article
                key={developer.name}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.12 }}
                whileHover={{ y: -4 }}
                className="rounded-2xl border border-[#e1e8f1] bg-white px-4 py-4 text-center shadow-[0_8px_24px_-16px_rgba(25,70,120,0.24)] transition-transform sm:px-5"
              >
                <div className="flex flex-col items-center">
                  <DeveloperPhoto {...developer} />
                  <h2 className="mt-3 font-syne text-lg leading-snug">{developer.name}</h2>
                  <p className="mt-1 text-xs font-bold text-cvsu-green">{developer.role}</p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#68788e]">
                  {developer.description}
                </p>
              </motion.article> 
            ))}
          </div>
        </div>
        </section>
      </main>
    </>
  );
}
