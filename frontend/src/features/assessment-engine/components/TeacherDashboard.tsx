"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Question, QuizType, CvSUUser, PublishedQuiz, SourceMaterialType } from "@/types/quiz";
import { publishQuiz, fetchQuizzes, deleteQuiz } from "@/lib/api";
import {
  IconList,
  IconToggle,
  IconEdit,
  IconMessage,
  IconBarChart,
  IconTrash,
  IconSparkles,
  IconCheckCircle,
  IconRefresh,
  IconPlus,
  IconUpload,
  IconFilePdf,
  IconImage,
  IconFileText,
  IconArrowRight,
} from "@/components/icons";
import AIChatbot from "@/components/shared/AIChatbot"; // Adjusted as per instruction
import TeacherQuizPreview from "@/features/assessment-engine/components/TeacherQuizPreview";

interface Props {
  currentUser?: CvSUUser;
  onViewGrades: () => void;
}

interface FormatOption {
  value: QuizType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const ASSESSMENT_FORMATS: FormatOption[] = [
  {
    value: "Multiple Choice",
    label: "Multiple Choice",
    description: "4 structured options with a single verified correct answer",
    icon: <IconList size={18} className="text-cvsu-green group-hover:scale-110 transition-transform duration-200" />,
  },
  {
    value: "True or False",
    label: "True or False",
    description: "Binary statements testing core conceptual principles",
    icon: <IconToggle size={18} className="text-cvsu-green group-hover:scale-110 transition-transform duration-200" />,
  },
  {
    value: "Identification",
    label: "Identification",
    description: "Specific term recall evaluated with semantic tolerance",
    icon: <IconEdit size={18} className="text-cvsu-green group-hover:scale-110 transition-transform duration-200" />,
  },
  {
    value: "Open Ended",
    label: "Open Ended",
    description: "Descriptive responses evaluated for depth and understanding",
    icon: <IconMessage size={18} className="text-cvsu-green group-hover:scale-110 transition-transform duration-200" />,
  },
  {
    value: "Mixed Assessment",
    label: "Mixed / Custom Sections (Hybrid Exam)",
    description: "Combine multiple choice, identification, and essays in one exam",
    icon: <IconSparkles size={18} className="text-cvsu-green group-hover:scale-110 transition-transform duration-200" />,
  },
];

export default function TeacherDashboard({ currentUser, onViewGrades }: Props) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<SourceMaterialType>("topic");
  const [topic, setTopic] = useState("");
  const [notesText, setNotesText] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [quizType, setQuizType] = useState<QuizType>("Multiple Choice");
  
  // Mixed / Multi-section counters
  const [mcCount, setMcCount] = useState(10);
  const [tfCount, setTfCount] = useState(0);
  const [idCount, setIdCount] = useState(0);
  const [openCount, setOpenCount] = useState(10);

  const totalMixedCount = mcCount + tfCount + idCount + openCount;
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [previewQuestions, setPreviewQuestions] = useState<Question[] | null>(null);
  const [previewTopic, setPreviewTopic] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const getLoadingStep = (sec: number) => {
    if (sec < 4) return "Reading topic & source material...";
    if (sec < 9) return "Gemini 3.6 Flash is extracting concepts...";
    if (sec < 15) return "Synthesizing balanced questions & options...";
    if (sec < 22) return "Validating answer keys & explanations...";
    return "Finalizing assessment into database...";
  };

  const { data: quizzes = [], isLoading: loadingQuizzes, refetch: loadQuizzes } = useQuery({
    queryKey: ["quizzes", "teacher"],
    queryFn: () => fetchQuizzes(),
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError("File size exceeds 15MB limit. Please upload a smaller PDF or image.");
      return;
    }

    setError("");
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1];
      setFileBase64(base64Data);

      if (file.type.startsWith("image/")) {
        setFilePreviewUrl(result);
      } else {
        setFilePreviewUrl(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileBase64(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePublish = async () => {
    // Validation
    if (sourceType === "topic" && !topic.trim()) {
      setError("Please specify an assessment topic or lesson title.");
      return;
    }
    if ((sourceType === "image" || sourceType === "pdf") && !fileBase64) {
      setError(`Please upload a valid ${sourceType === "pdf" ? "PDF document" : "image"} first.`);
      return;
    }
    if (sourceType === "text" && !notesText.trim()) {
      setError("Please paste lecture notes or course text.");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccessMessage("");
    setPreviewQuestions(null);

    const effectiveTopic = topic.trim() || (selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : "Course Assessment");

    try {
      let sectionsPayload = undefined;
      let effectiveCount = questionCount;

      if (quizType === "Mixed Assessment") {
        const activeSecs = [];
        if (mcCount > 0) activeSecs.push({ quiz_type: "Multiple Choice" as QuizType, question_count: mcCount });
        if (tfCount > 0) activeSecs.push({ quiz_type: "True or False" as QuizType, question_count: tfCount });
        if (idCount > 0) activeSecs.push({ quiz_type: "Identification" as QuizType, question_count: idCount });
        if (openCount > 0) activeSecs.push({ quiz_type: "Open Ended" as QuizType, question_count: openCount });

        if (activeSecs.length === 0) {
          setError("Please configure at least 1 question for your mixed assessment.");
          setIsLoading(false);
          return;
        }

        sectionsPayload = activeSecs;
        effectiveCount = totalMixedCount;
      }

      const payload = {
        topic: effectiveTopic,
        question_count: effectiveCount,
        quiz_type: quizType,
        sections: sectionsPayload,
        created_by_email: currentUser?.email,
        source_type: (sourceType === "image" || sourceType === "pdf" ? "file" : sourceType === "text" ? "text" : "topic") as "file" | "text" | "topic",
        content_text: sourceType === "text" ? notesText.trim() : undefined,
        file_base64: (sourceType === "image" || sourceType === "pdf") ? (fileBase64 || undefined) : undefined,
        file_mime_type: selectedFile?.type,
        file_name: selectedFile?.name,
      };

      const result = await publishQuiz(payload);
      setPreviewQuestions(result.quiz.questions);
      setPreviewTopic(effectiveTopic);
      setSuccessMessage(`Assessment "${effectiveTopic}" published to the class repository.`);
      
      // Reset inputs
      setTopic("");
      setNotesText("");
      handleClearFile();
      loadQuizzes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate assessment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string, quizTopic: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${quizTopic}"?`)) {
      return;
    }
    setDeletingId(quizId);
    try {
      await deleteQuiz(quizId);
      loadQuizzes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete assessment.");
    } finally {
      setDeletingId(null);
    }
  };

  // Preview Mode when assessment generated
  if (previewQuestions && successMessage) {
    return (
      <div className="view-transition space-y-6">
        <div className="p-5 bg-cvsu-dark border border-cvsu-vibrant/30 rounded-2xl flex items-start gap-3.5 text-white shadow-md">
          <IconCheckCircle size={22} className="text-cvsu-vibrant shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-cvsu-vibrant">{successMessage}</p>
            <p className="text-xs text-white/70 mt-0.5">Students can now access and submit responses for this assessment from the Student Portal.</p>
          </div>
        </div>

        <TeacherQuizPreview topic={previewTopic} questions={previewQuestions} quizType={quizType} />

        <button
          type="button"
          onClick={() => {
            setPreviewQuestions(null);
            setSuccessMessage("");
          }}
          className="w-full bg-cvsu-green hover:bg-cvsu-dark text-white font-bold py-3.5 px-6 rounded-full text-sm transition-all btn-tactile hover:-translate-y-0.5 flex items-center justify-center gap-2 shadow-md cursor-pointer border border-cvsu-vibrant/30"
        >
          <IconPlus size={16} className="text-cvsu-vibrant" />
          <span>Create Another Assessment</span>
        </button>
      </div>
    );
  }

  return (
    <div className="view-transition space-y-8">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[#1C1C1C]">Faculty Assessment Studio</h2>
          <p className="text-xs text-stone-500 mt-1">
            Generate curriculum assessments from topic prompts, lecture photos, PDF slides, or raw notes.
          </p>
        </div>
        <button
          type="button"
          onClick={onViewGrades}
          className="self-start sm:self-auto px-5 py-2.5 bg-[#F7F7F2] hover:bg-stone-200 text-[#1C1C1C] border border-stone-300 rounded-full text-xs font-bold transition-all flex items-center gap-2 shadow-xs btn-tactile hover:-translate-y-0.5 cursor-pointer"
        >
          <IconBarChart size={16} className="text-cvsu-green" />
          <span>Institutional Gradebook</span>
        </button>
      </div>

      {/* Creation Form */}
      <div className="space-y-6">

        {/* Source Material Selector Tabs */}
        <div>
          <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2.5">
            1. Select Source Material Input
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            
            <button
              type="button"
              onClick={() => {
                setSourceType("topic");
                handleClearFile();
              }}
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all btn-tactile hover:-translate-y-0.5 cursor-pointer ${
                sourceType === "topic"
                  ? "border-cvsu-green bg-cvsu-green text-white shadow-md ring-2 ring-cvsu-green/20"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-[#F7F7F2] hover:border-stone-300"
              }`}
            >
              <IconSparkles size={16} className={sourceType === "topic" ? "text-cvsu-vibrant" : "text-stone-400"} />
              <span>Topic Prompt</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceType("image");
                handleClearFile();
              }}
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all btn-tactile hover:-translate-y-0.5 cursor-pointer ${
                sourceType === "image"
                  ? "border-cvsu-green bg-cvsu-green text-white shadow-md ring-2 ring-cvsu-green/20"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-[#F7F7F2] hover:border-stone-300"
              }`}
            >
              <IconImage size={16} className={sourceType === "image" ? "text-cvsu-vibrant" : "text-stone-400"} />
              <span>Lecture Photo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceType("pdf");
                handleClearFile();
              }}
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all btn-tactile hover:-translate-y-0.5 cursor-pointer ${
                sourceType === "pdf"
                  ? "border-cvsu-green bg-cvsu-green text-white shadow-md ring-2 ring-cvsu-green/20"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-[#F7F7F2] hover:border-stone-300"
              }`}
            >
              <IconFilePdf size={16} className={sourceType === "pdf" ? "text-cvsu-vibrant" : "text-stone-400"} />
              <span>PDF Slides</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceType("text");
                handleClearFile();
              }}
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all btn-tactile hover:-translate-y-0.5 cursor-pointer ${
                sourceType === "text"
                  ? "border-cvsu-green bg-cvsu-green text-white shadow-md ring-2 ring-cvsu-green/20"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-[#F7F7F2] hover:border-stone-300"
              }`}
            >
              <IconFileText size={16} className={sourceType === "text" ? "text-cvsu-vibrant" : "text-stone-400"} />
              <span>Paste Notes</span>
            </button>

          </div>
        </div>

        {/* Dynamic Source Input Section */}
        {sourceType === "topic" && (
          <div>
            <label htmlFor="assessment-topic" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
              Assessment Topic or Lesson Subject
            </label>
            <input
              id="assessment-topic"
              type="text"
              placeholder="e.g., IT 201 Object Oriented Programming, Philippine Constitution of 1987"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-4 py-3.5 bg-white border border-stone-300 rounded-2xl text-sm text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green transition-all shadow-xs"
            />
          </div>
        )}

        {(sourceType === "image" || sourceType === "pdf") && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                Upload {sourceType === "pdf" ? "Course PDF Document" : "Lecture Photo / Textbook Diagram"}
              </label>
              <span className="text-[11px] text-stone-400 font-mono">
                {sourceType === "pdf" ? "PDF (Max 15MB)" : "JPG, PNG, WEBP (Max 15MB)"}
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept={sourceType === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/jpg,image/webp"}
              onChange={handleFileChange}
              className="hidden"
              id="file-upload-input"
            />

            {!selectedFile ? (
              <label
                htmlFor="file-upload-input"
                className="p-8 border-2 border-dashed border-stone-300 hover:border-cvsu-green bg-[#F7F7F2]/60 hover:bg-cvsu-light/40 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 group shadow-xs hover:-translate-y-0.5"
              >
                <div className="w-14 h-14 rounded-2xl bg-white border border-stone-200 group-hover:border-cvsu-green text-stone-400 group-hover:text-cvsu-green group-hover:scale-105 flex items-center justify-center transition-all shadow-sm">
                  <IconUpload size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-[#1C1C1C] group-hover:text-cvsu-green transition-colors">
                    Click to browse or drag & drop {sourceType === "pdf" ? "lecture PDF" : "image photo"}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">
                    Gemini 3.6 Flash will extract concepts and synthesize balanced questions strictly from this source.
                  </p>
                </div>
              </label>
            ) : (
              <div className="p-4 bg-cvsu-light/80 border border-cvsu-green/30 rounded-2xl flex items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3.5 min-w-0">
                  {filePreviewUrl ? (
                    <img
                      src={filePreviewUrl}
                      alt="Upload thumbnail"
                      className="w-12 h-12 rounded-xl object-cover border border-cvsu-green/30 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-cvsu-dark text-cvsu-vibrant flex items-center justify-center shrink-0 shadow-xs">
                      <IconFilePdf size={22} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1C1C1C] truncate font-mono">{selectedFile.name}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB • Attached Source Material</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearFile}
                  className="px-3.5 py-1.5 bg-white hover:bg-red-50 text-red-700 border border-stone-200 hover:border-red-200 rounded-full text-xs font-bold transition-colors btn-tactile shrink-0 cursor-pointer"
                >
                  Remove File
                </button>
              </div>
            )}

            <div>
              <label htmlFor="optional-subtopic" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Optional: Focus Topic / Module Name
              </label>
              <input
                id="optional-subtopic"
                type="text"
                placeholder="e.g., Chapter 4: Cellular Respiration or Section 2.1"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-stone-300 rounded-2xl text-xs text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green transition-all"
              />
            </div>
          </div>
        )}

        {sourceType === "text" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="notes-textarea" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                Paste Lecture Notes, Transcript, or Article
              </label>
              <textarea
                id="notes-textarea"
                rows={5}
                placeholder="Paste course notes, slides text, or discussion summary here..."
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                className="w-full p-4 bg-white border border-stone-300 rounded-2xl text-xs text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green transition-all shadow-xs leading-relaxed"
              />
            </div>

            <div>
              <label htmlFor="notes-topic" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Optional: Lesson Title
              </label>
              <input
                id="notes-topic"
                type="text"
                placeholder="e.g., Lecture 5: Database Normalization"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-stone-300 rounded-2xl text-xs text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green transition-all"
              />
            </div>
          </div>
        )}

        {/* 2. Assessment Format Selection */}
        <div>
          <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2.5">
            2. Assessment Format
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ASSESSMENT_FORMATS.map((format) => {
              const isSelected = quizType === format.value;
              return (
                <button
                  key={format.value}
                  type="button"
                  onClick={() => setQuizType(format.value)}
                  className={`p-4 text-left rounded-2xl border transition-all duration-200 flex items-start gap-3.5 btn-tactile hover:-translate-y-0.5 cursor-pointer group ${
                    isSelected
                      ? "border-cvsu-green bg-cvsu-green text-white shadow-md ring-2 ring-cvsu-green/20"
                      : "border-stone-200 bg-white hover:border-cvsu-green/50 hover:bg-[#F7F7F2] text-[#1C1C1C] shadow-xs"
                  }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 transition-colors ${
                    isSelected ? "bg-cvsu-vibrant text-cvsu-dark" : "bg-stone-100 text-stone-600 group-hover:bg-cvsu-light group-hover:text-cvsu-green"
                  }`}>
                    {format.icon}
                  </div>
                  <div>
                    <p className={`text-sm font-bold tracking-tight transition-colors ${isSelected ? "text-cvsu-vibrant" : "text-[#1C1C1C]"}`}>
                      {format.label}
                    </p>
                    <p className={`text-xs mt-0.5 leading-relaxed ${isSelected ? "text-white/75" : "text-stone-500"}`}>
                      {format.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Question Count & Multi-Section Configuration */}
        {quizType === "Mixed Assessment" ? (
          <div className="p-6 bg-[#F7F7F2] border border-stone-300/80 rounded-3xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-stone-200">
              <div>
                <h3 className="text-sm font-bold text-[#1C1C1C] uppercase tracking-wider">
                  3. Configure Hybrid Exam Sections
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Customize the question breakdown across Multiple Choice, True/False, Identification, and Open-Ended formats.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-cvsu-green px-3.5 py-1.5 bg-white border border-stone-300 rounded-full shadow-xs">
                  Total: {totalMixedCount} Questions
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider">
                Quick Exam Presets
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setMcCount(10); setTfCount(0); setIdCount(0); setOpenCount(10); }}
                  className="px-3.5 py-1.5 bg-white hover:bg-cvsu-light text-cvsu-green border border-stone-200 hover:border-cvsu-green rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  🎯 10 MC + 10 Open Ended (20 Items)
                </button>
                <button
                  type="button"
                  onClick={() => { setMcCount(10); setTfCount(0); setIdCount(5); setOpenCount(5); }}
                  className="px-3.5 py-1.5 bg-white hover:bg-cvsu-light text-cvsu-green border border-stone-200 hover:border-cvsu-green rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  ⚖️ Midterm Exam (10 MC + 5 ID + 5 Open Ended)
                </button>
                <button
                  type="button"
                  onClick={() => { setMcCount(5); setTfCount(5); setIdCount(5); setOpenCount(0); }}
                  className="px-3.5 py-1.5 bg-white hover:bg-cvsu-light text-cvsu-green border border-stone-200 hover:border-cvsu-green rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  ⚡ Objective Quiz (5 MC + 5 TF + 5 ID)
                </button>
              </div>
            </div>

            {/* Section Item Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Part 1: Multiple Choice */}
              <div className="p-4 bg-white border border-stone-200 rounded-2xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#1C1C1C]">Multiple Choice</span>
                  <span className="text-xs font-mono font-bold text-cvsu-green px-2.5 py-0.5 bg-cvsu-light rounded-md">{mcCount} items</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={mcCount}
                  onChange={(e) => setMcCount(Number(e.target.value))}
                  className="w-full accent-cvsu-green"
                />
              </div>

              {/* Part 2: True / False */}
              <div className="p-4 bg-white border border-stone-200 rounded-2xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#1C1C1C]">True or False</span>
                  <span className="text-xs font-mono font-bold text-cvsu-green px-2.5 py-0.5 bg-cvsu-light rounded-md">{tfCount} items</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={tfCount}
                  onChange={(e) => setTfCount(Number(e.target.value))}
                  className="w-full accent-cvsu-green"
                />
              </div>

              {/* Part 3: Identification */}
              <div className="p-4 bg-white border border-stone-200 rounded-2xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#1C1C1C]">Identification</span>
                  <span className="text-xs font-mono font-bold text-cvsu-green px-2.5 py-0.5 bg-cvsu-light rounded-md">{idCount} items</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={idCount}
                  onChange={(e) => setIdCount(Number(e.target.value))}
                  className="w-full accent-cvsu-green"
                />
              </div>

              {/* Part 4: Open Ended / Essay */}
              <div className="p-4 bg-white border border-stone-200 rounded-2xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#1C1C1C]">Open Ended / Essay</span>
                  <span className="text-xs font-mono font-bold text-cvsu-green px-2.5 py-0.5 bg-cvsu-light rounded-md">{openCount} items</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={openCount}
                  onChange={(e) => setOpenCount(Number(e.target.value))}
                  className="w-full accent-cvsu-green"
                />
              </div>

            </div>
          </div>
        ) : (
          <div className="p-5 bg-[#F7F7F2] border border-stone-200 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <label htmlFor="question-count-slider" className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                3. Number of Questions
              </label>
              <span className="text-xs font-mono font-bold text-cvsu-green px-3 py-1 bg-white border border-stone-200 rounded-full shadow-xs">
                {questionCount} {questionCount === 1 ? "Question" : "Questions"}
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <input
                id="question-count-slider"
                type="range"
                min={1}
                max={50}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="flex-1 accent-cvsu-green"
              />
            </div>
          </div>
        )}

        {/* Generate Button with CvSU Primary Styling */}
        <button
          type="button"
          onClick={handlePublish}
          disabled={isLoading}
          className="w-full bg-cvsu-green hover:bg-cvsu-dark text-white font-extrabold py-4 px-8 rounded-full text-sm sm:text-base transition-all shadow-lg hover:shadow-xl btn-tactile hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 cursor-pointer group border border-cvsu-vibrant/30"
        >
          {isLoading ? (
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{getLoadingStep(elapsedSeconds)}</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-bold ml-1">
                {elapsedSeconds}s
              </span>
            </div>
          ) : (
            <>
              <IconSparkles size={18} className="text-cvsu-vibrant group-hover:rotate-12 transition-transform duration-200" />
              <span>
                {sourceType === "image"
                  ? "Analyze Diagram & Synthesize Assessment"
                  : sourceType === "pdf"
                  ? "Ingest Slides & Generate Assessment"
                  : sourceType === "text"
                  ? "Transform Notes into Assessment"
                  : "Synthesize Interactive Assessment"}
              </span>
              <IconArrowRight size={16} className="text-cvsu-vibrant group-hover:translate-x-1 transition-transform duration-200" />
            </>
          )}
        </button>

        {isLoading && (
          <p className="text-center text-xs text-stone-500 animate-pulse font-medium">
            ⏳ Generating questions with Gemini 3.6 Flash usually takes 10–25 seconds. Please keep this tab open.
          </p>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center gap-2 view-transition">
            <span className="shrink-0 text-base leading-none">⚠️</span>
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Published Assessments List */}
      <div className="pt-8 border-t border-stone-200">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-sm font-bold text-[#1C1C1C] uppercase tracking-wider">
              Published Class Assessments ({quizzes.length})
            </h3>
            <p className="text-xs text-stone-500">Live assessments currently accessible to enrolled students.</p>
          </div>
          <button
            type="button"
            onClick={() => loadQuizzes()}
            disabled={loadingQuizzes}
            className="text-xs font-bold text-stone-700 hover:text-cvsu-green flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-full bg-[#F7F7F2] hover:bg-stone-200 border border-stone-300 btn-tactile cursor-pointer"
          >
            <IconRefresh size={13} className={loadingQuizzes ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {quizzes.length === 0 ? (
          <div className="p-10 text-center bg-[#F7F7F2]/60 border border-dashed border-stone-300 rounded-3xl text-stone-500 text-xs">
            No assessments published yet. Generate your first assessment above.
          </div>
        ) : (
          <div className="divide-y divide-stone-200 border border-stone-200 rounded-3xl overflow-hidden bg-white shadow-xs">
            {quizzes.map((q) => (
              <div
                key={q.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F7F7F2]/60 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-[#1C1C1C] group-hover:text-cvsu-green transition-colors truncate">{q.topic}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cvsu-light text-cvsu-green border border-cvsu-green/30">
                      {q.quiz_type}
                    </span>
                    <span className="text-xs text-stone-500 font-mono">
                      {q.question_count} Questions
                    </span>
                    {q.created_by_email && (
                      <span className="text-xs text-stone-400 font-mono">
                        • Instructor: {q.created_by_email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => router.push(`/quiz/${q.id}?preview=teacher`)}
                    className="px-4 py-2 bg-cvsu-green hover:bg-cvsu-dark text-white border border-cvsu-green rounded-full text-xs font-bold transition-all flex items-center gap-1.5 btn-tactile hover:-translate-y-0.5 shadow-xs cursor-pointer"
                  >
                    <IconArrowRight size={14} />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuiz(q.id, q.topic)}
                    disabled={deletingId === q.id}
                    className="px-4 py-2 bg-white hover:bg-red-50 text-red-700 hover:text-red-800 border border-stone-200 hover:border-red-300 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 btn-tactile hover:-translate-y-0.5 disabled:opacity-50 shadow-xs cursor-pointer"
                  >
                    <IconTrash size={14} />
                    <span>{deletingId === q.id ? "Deleting..." : "Delete"}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
