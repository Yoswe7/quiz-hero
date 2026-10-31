# CvSU Quiz Hero — Institutional Brand Guidelines

Official brand, color palette, and visual hierarchy standards for the Cavite State University (CvSU) Quiz Hero academic assessment and spaced-repetition platform.

---

## 1. Core Color Palette

The platform adheres strictly to the official Cavite State University institutional identity, paired with clean, accessible neutral tones.

| Token | Hex Value | Role | Usage |
|---|---|---|---|
| **CvSU Forest Green** | `#14532d` | Primary Institutional Color | Main branding, primary action buttons, active navigation, headers |
| **Institutional Gold** | `#eab308` | Accent & Status Color | Accents, badges, highlights, achievement indicators, borders |
| **Off-White Background** | `#f8fafc` | Base App Background | Page backgrounds, subtle contrast against cards |
| **Card Surface** | `#ffffff` | Primary Surface | Content cards, modal dialogs, assessment sheets |
| **Slate Dark (Text)** | `#0f172a` | Primary Text | Headings, question prompts, high-contrast labels |
| **Slate Muted** | `#475569` | Secondary Text | Subtitles, supporting descriptions, instructions |
| **Slate Border** | `#e2e8f0` | Dividers & Borders | Card borders, table dividers, input outlines |

---

## 2. Typography

- **Primary Font Family:** `Geist Sans` (Tailwind `font-sans`)
- **Monospace Family:** `Geist Mono` (Tailwind `font-mono`) — used for emails, course codes, timer counters, and code snippets.
- **Tone:** Academic, supportive, concise, learner-centered. Avoid compliance-heavy jargon in student-facing areas.

---

## 3. Component & Layout Standards

### Cards & Modals
- **Surface:** Always `#ffffff` with subtle borders (`border-slate-200/90`).
- **Corners:** Rounded (`rounded-2xl` for modals and main containers, `rounded-xl` for small cards).
- **Elevation:** Subtle shadows (`shadow-sm`, `shadow-md`, `shadow-xl`) rather than heavy multi-layer drop shadows.
- **Institutional Accent Bar:** Modals and prominent cards feature a 2px top gradient accent bar (`bg-gradient-to-r from-[#14532d] via-[#14532d] to-[#eab308]`).

### Interactive Elements
- **Primary Buttons:** Forest Green background (`bg-[#14532d] hover:bg-[#166534]`), high-contrast white text (`text-white`), rounded corners (`rounded-full` or `rounded-xl`), tactile micro-transitions (`transition-all active:scale-[0.98]`).
- **Google OAuth Button:** Standard official Google Identity button rendered with institutional domain restriction (`hosted_domain="cvsu.edu.ph"`).
- **Error Banners:** Light red background (`bg-red-50 border-red-200 text-red-700`) with clear, constructive error descriptions.

