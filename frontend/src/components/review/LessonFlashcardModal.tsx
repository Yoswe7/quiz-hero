"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  fetchSharedLessons,
  generateLessonFlashcards,
  LessonSection,
  parseLessonSections,
  ReviewItem,
  SharedLesson,
} from "@/lib/srs";

type SourceTab = "text" | "file" | "material";

interface LessonFlashcardModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (created: ReviewItem[]) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "").trim();
}

export default function LessonFlashcardModal({
  open,
  onClose,
  onGenerated,
}: LessonFlashcardModalProps) {
  const [tab, setTab] = useState<SourceTab>("text");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonText, setLessonText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sharedLessons, setSharedLessons] = useState<SharedLesson[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  const [sections, setSections] = useState<LessonSection[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [topic, setTopic] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [cardCount, setCardCount] = useState(8);

  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchSharedLessons()
      .then((list) => {
        if (!cancelled) setSharedLessons(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setSharedLessons([]);
      })
      .finally(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleClose = () => {
    setError("");
    onClose();
  };


  if (!open) return null;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSections([]);
    setSelectedIndices([]);
    setError("");
  };

  const handleAnalyze = async () => {
    setError("");
    setParsing(true);
    try {
      let res;
      if (tab === "text") {
        if (!lessonText.trim()) {
          throw new Error("Paste your lesson notes first.");
        }
        res = await parseLessonSections({
          source_type: "text",
          text: lessonText,
          filename: lessonTitle.trim() || "Pasted Lesson",
        });
      } else if (tab === "file") {
        if (!selectedFile) {
          throw new Error("Choose a PDF, DOCX, TXT, or MD file first.");
        }
        const base64 = await fileToBase64(selectedFile);
        res = await parseLessonSections({
          source_type: "file",
          filename: selectedFile.name,
          file_base64: base64,
          file_mime_type: selectedFile.type || undefined,
        });
      } else {
        if (selectedMaterialId === null) {
          throw new Error("Select a teacher course material first.");
        }
        res = await parseLessonSections({
          source_type: "material",
          material_id: selectedMaterialId,
        });
      }

      setSections(res.sections);
      setSelectedIndices(res.sections.map((s) => s.index));
      setSourceName(res.source_name);
      setTopic((prev) => prev.trim() || stripExtension(res.source_name) || "Lesson Study");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to analyze lesson.");
    } finally {
      setParsing(false);
    }
  };

  const toggleSection = (idx: number) => {
    setSelectedIndices((current) =>
      current.includes(idx) ? current.filter((item) => item !== idx) : [...current, idx]
    );
  };

  const handleGenerate = async () => {
    const chosen = sections.filter((s) => selectedIndices.includes(s.index));
    if (chosen.length === 0) {
      setError("Select at least one part of the lesson.");
      return;
    }
    setError("");
    setGenerating(true);
    try {
      const created = await generateLessonFlashcards({
        topic: topic.trim() || "Lesson Study",
        source_name: sourceName || undefined,
        selected_sections: chosen.map((s) => ({ title: s.title, content: s.content })),
        card_count: cardCount,
      });
      onGenerated(created);
      setSections([]);
      setSelectedIndices([]);
      setLessonText("");
      setSelectedFile(null);
      setTopic("");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate flashcards.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cvsu-dark/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-flashcard-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-cvsu-light/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-cvsu-green">
              Lesson to Flashcards
            </p>
            <h2 id="lesson-flashcard-title" className="text-lg font-black text-cvsu-dark">
              Select parts of a lesson to study
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-600 transition hover:border-cvsu-dark hover:text-cvsu-dark"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Source Tabs */}
          <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-1">
            {[
              ["text", "Paste Notes"],
              ["file", "Upload File"],
              ["material", `Teacher Materials (${sharedLessons.length})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key as SourceTab);
                  setSections([]);
                  setSelectedIndices([]);
                  setError("");
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  tab === key
                    ? "bg-cvsu-dark text-white shadow-xs"
                    : "text-stone-600 hover:text-cvsu-dark"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Source Inputs */}
          {tab === "text" && (
            <div className="space-y-3">
              <input
                type="text"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="Lesson title (optional, e.g. Chapter 3: Data Structures)"
                className="w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm text-cvsu-dark outline-none focus:border-cvsu-green"
              />
              <textarea
                value={lessonText}
                onChange={(e) => setLessonText(e.target.value)}
                placeholder="Paste your lesson notes, outline, or chapter text here..."
                className="min-h-36 w-full rounded-2xl border border-stone-200 p-3.5 text-sm text-cvsu-dark outline-none focus:border-cvsu-green"
              />
            </div>
          )}

          {tab === "file" && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/70 px-4 py-8 text-center transition hover:border-cvsu-green hover:bg-cvsu-light/30">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileChange}
                className="hidden"
              />
              <span className="text-sm font-bold text-cvsu-dark">
                {selectedFile ? selectedFile.name : "Click to choose a lesson file"}
              </span>
              <span className="mt-1 text-xs text-stone-500">
                Supports PDF, DOCX, TXT, or Markdown
              </span>
            </label>
          )}

          {tab === "material" && (
            <div className="space-y-2">
              {sharedLessons.length === 0 ? (
                <p className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs text-stone-600">
                  No prepared teacher course materials are available yet. Try pasting notes or uploading a file.
                </p>
              ) : (
                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {sharedLessons.map((mat) => (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => {
                        setSelectedMaterialId(mat.id);
                        setSections([]);
                        setSelectedIndices([]);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        selectedMaterialId === mat.id
                          ? "border-cvsu-green bg-cvsu-light/60"
                          : "border-stone-200 bg-white hover:border-stone-300"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-cvsu-dark">{mat.filename}</p>
                        <p className="text-[11px] text-stone-500">
                          {mat.created_by_email} · {Math.max(1, Math.round(mat.char_count / 1000))}k chars
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 text-xs font-bold text-cvsu-green">
                        {selectedMaterialId === mat.id ? "Selected" : "Select"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={parsing || generating}
              onClick={() => void handleAnalyze()}
              className="rounded-full bg-cvsu-green px-4 py-2 text-xs font-bold text-white transition hover:bg-cvsu-dark disabled:opacity-50"
            >
              {parsing ? "Analyzing sections..." : sections.length > 0 ? "Re-analyze Lesson Parts" : "Analyze Lesson Parts"}
            </button>
          </div>

          {/* Selectable Sections */}
          {sections.length > 0 && (
            <div className="space-y-3 border-t border-stone-200 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-cvsu-dark">
                    Select Lesson Parts ({selectedIndices.length} of {sections.length})
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Only checked sections will be used to generate flashcards.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIndices(sections.map((s) => s.index))}
                    className="rounded-full border border-stone-200 px-3 py-1 text-[11px] font-bold text-stone-600 hover:border-cvsu-green hover:text-cvsu-dark"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIndices([])}
                    className="rounded-full border border-stone-200 px-3 py-1 text-[11px] font-bold text-stone-600 hover:border-cvsu-green hover:text-cvsu-dark"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {sections.map((sec) => {
                  const checked = selectedIndices.includes(sec.index);
                  return (
                    <label
                      key={sec.index}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${
                        checked
                          ? "border-cvsu-green bg-cvsu-light/45"
                          : "border-stone-200 bg-white hover:border-stone-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSection(sec.index)}
                        className="mt-1 h-4 w-4 accent-[#0B3126]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-cvsu-dark">
                            {sec.title}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-stone-400">
                            {sec.char_count} chars
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-stone-600">{sec.preview}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Deck Topic Label
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Operating Systems - Deadlocks"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-cvsu-dark outline-none focus:border-cvsu-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Flashcards
                  </label>
                  <select
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-cvsu-dark outline-none focus:border-cvsu-green"
                  >
                    {[5, 8, 12, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n} cards
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-stone-200 bg-stone-50 px-6 py-3.5">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-600 hover:text-cvsu-dark"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sections.length === 0 || selectedIndices.length === 0 || generating}
            onClick={() => void handleGenerate()}
            className="rounded-full bg-cvsu-dark px-5 py-2 text-xs font-bold text-white transition hover:bg-cvsu-dark/90 disabled:opacity-50"
          >
            {generating ? "Generating flashcards..." : `Generate ${cardCount} Flashcards`}
          </button>
        </div>
      </div>
    </div>
  );
}
