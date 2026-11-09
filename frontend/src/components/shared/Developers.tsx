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
  return (
    <main className="min-h-screen bg-[#fbfcff] text-[#14213d]">
      <header className="border-b border-[#dce7f7] bg-white/90 text-[#14213d]">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cvsu-light text-cvsu-green shadow-sm transition-transform group-hover:scale-105">
              <IconCvSU size={22} />
            </div>
            <div>
              <span className="font-syne text-lg tracking-tight transition-colors group-hover:text-cvsu-green">
                Quiz Hero
              </span>
              <p className="text-[11px] font-medium text-[#718096]">
                Cavite State University - Imus Campus
              </p>
            </div>
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[#d5e2f5] px-4 py-2 text-xs font-semibold text-[#52627a] transition-colors hover:border-cvsu-green hover:text-cvsu-green"
          >
            Back to home
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 py-24 sm:px-8 sm:py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(ellipse_at_top,#e5ebc8_0%,#f5f7ea_48%,rgba(251,252,255,0)_78%)]" />
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
  );
}
