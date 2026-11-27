"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Question, QuizType, CvSUUser, PublishedQuiz, SourceMaterialType } from "@/types/quiz";
import { publishQuiz, publishQuizStream, publishAssessment, fetchQuizzes, fetchClassrooms, fetchQuizAnswers, fetchQuizAttempts, gradeFacultyAttempt, deleteQuiz, assignStudentToQuiz, API_URL, fetchMaterials, prepareMaterial, retryMaterial, PreparedMaterial } from "@/lib/api";
import { formatManilaDateTime } from "@/lib/dateUtils";
import { validateQuestionTimeLimitSeconds } from "@/lib/quizValidation";
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
import TeacherQuizPreview from "@/features/assessment-engine/components/TeacherQuizPreview";
import AssessmentEditorModal from "@/features/assessment-engine/components/AssessmentEditorModal";
import { clearDraft, readDraft, writeDraft } from "@/lib/draftRecovery";

interface QuizAttemptAnswer {
  question: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  is_overridden: boolean;
  awarded_points: number;
}

interface QuizAttemptItem {
  attempt_id: number;
  student_email: string;
  student_name: string;
  raw_score: number;
  ai_score?: number;
  adjusted_score: number | null;
  final_score: number;
  total_items: number;
  is_verified: boolean;
  grading_status?: string;
  faculty_remarks: string | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
  answers: QuizAttemptAnswer[];
}

type PreloadQueueStatus = "queued" | "preparing" | "ready" | "failed";

interface PreloadQueueItem {
  id: string;
  filename: string;
  status: PreloadQueueStatus;
}

interface FileFingerprint {
  key: string;
  kind: "sha256" | "filename";
}

interface Props {
  currentUser?: CvSUUser;
  onViewGrades: () => void;
  view?: "generate" | "published";
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

export default function TeacherDashboard({ currentUser, onViewGrades, view = "generate" }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const draftKey = `quiz-hero:draft:faculty:${currentUser?.email?.toLowerCase() || "anonymous"}`;
  const [savedDraft] = useState<{
    sourceType?: SourceMaterialType;
    topic?: string;
    notesText?: string;
    questionCount?: number;
    quizType?: QuizType;
    courseCode?: string;
    classSection?: string;
    availableFrom?: string;
    dueAt?: string;
    assignedStudentEmails?: string;
  } | null>(() => readDraft(draftKey));
  const [sourceType, setSourceType] = useState<SourceMaterialType>(savedDraft?.sourceType || "topic");
  const [generationMode, setGenerationMode] = useState<"fast" | "complex">("fast");
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [topic, setTopic] = useState(savedDraft?.topic || "");
  const [notesText, setNotesText] = useState(savedDraft?.notesText || "");
  const [questionCount, setQuestionCount] = useState(savedDraft?.questionCount || 5);
  const [quizType, setQuizType] = useState<QuizType>(savedDraft?.quizType || "Multiple Choice");
  const [courseCode, setCourseCode] = useState(savedDraft?.courseCode || "");
  const [classSection, setClassSection] = useState(savedDraft?.classSection || "");
  const [classroomId, setClassroomId] = useState("");
  const [availableFrom, setAvailableFrom] = useState(savedDraft?.availableFrom || "");
  const [dueAt, setDueAt] = useState(savedDraft?.dueAt || "");
  const [assignedStudentEmails, setAssignedStudentEmails] = useState(savedDraft?.assignedStudentEmails || "");
  
  // Mixed / Multi-section counters
  const [mcCount, setMcCount] = useState(10);
  const [tfCount, setTfCount] = useState(0);
  const [idCount, setIdCount] = useState(0);
  const [openCount, setOpenCount] = useState(10);

  const [questionTimeLimitSeconds, setQuestionTimeLimitSeconds] = useState("");
  const [timerError, setTimerError] = useState<string | null>(null);
  const timerInputRef = useRef<HTMLInputElement>(null);

  const totalMixedCount = mcCount + tfCount + idCount + openCount;
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prepared materials (hidden pre-load drawer + silent auto-matching)
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [showPreloadDrawer, setShowPreloadDrawer] = useState(false);
  const [preloadQueue, setPreloadQueue] = useState<PreloadQueueItem[]>([]);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const preloadChainRef = useRef<Promise<void>>(Promise.resolve());

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [previewQuestions, setPreviewQuestions] = useState<Question[] | null>(null);
  const [previewTopic, setPreviewTopic] = useState("");
  const [previewQuizId, setPreviewQuizId] = useState<string | null>(null);
  const [previewReviewStatus, setPreviewReviewStatus] = useState<"draft" | "published">("draft");
  const [isStreamingDraft, setIsStreamingDraft] = useState(false);
  const [streamStatusMessage, setStreamStatusMessage] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [assessmentSearch, setAssessmentSearch] = useState("");

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isLoading]);

  const getLoadingStep = (sec: number) => {
    if (generationMode === "complex") {
      if (sec < 4) return "Reading source, equations & figures...";
      if (sec < 10) return "Analyzing complex concepts & visuals...";
      if (sec < 20) return "Synthesizing assessment sections in parallel...";
      if (sec < 35) return "Verifying answers & reasoning steps...";
      return "Finalizing complex assessment (up to 65s)...";
    }
    if (sec < 4) return "Reading topic & source material...";
    if (sec < 9) return "Extracting key concepts...";
    if (sec < 15) return "Synthesizing balanced questions & options...";
    if (sec < 22) return "Validating answer keys & explanations...";
    return "Still processing the source...";
  };

  const { data: quizzes = [], isLoading: loadingQuizzes, refetch: loadQuizzes } = useQuery({
    queryKey: ["quizzes", "teacher"],
    queryFn: () => fetchQuizzes(),
  });
  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", "teacher"],
    queryFn: fetchClassrooms,
  });

  const { data: preparedMaterials = [], refetch: loadMaterials } = useQuery({
    queryKey: ["materials", "teacher"],
    queryFn: fetchMaterials,
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingQuiz, setEditingQuiz] = useState<{ id: string; topic: string } | null>(null);
  const [assigningQuiz, setAssigningQuiz] = useState<PublishedQuiz | null>(null);
  const [studentEmail, setStudentEmail] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [showDraftNotice, setShowDraftNotice] = useState(Boolean(savedDraft));
  const draftCompletedRef = useRef(false);
  const [facultyRemarks, setFacultyRemarks] = useState("");
  const [showSubmissionDrawer, setShowSubmissionDrawer] = useState(false);
  const [drawerQuiz, setDrawerQuiz] = useState<{ id: string; topic: string } | null>(null);
  const [drawerAttempts, setDrawerAttempts] = useState<QuizAttemptItem[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttemptItem | null>(null);
  const [manualFinalScore, setManualFinalScore] = useState<number | null>(null);
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  useEffect(() => {
    if (view !== "generate" || draftCompletedRef.current) return;
    const timeout = window.setTimeout(() => {
      writeDraft(draftKey, {
        sourceType,
        topic,
        notesText,
        questionCount,
        quizType,
        courseCode,
        classSection,
        availableFrom,
        dueAt,
        assignedStudentEmails,
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    availableFrom,
    assignedStudentEmails,
    classSection,
    courseCode,
    draftKey,
    dueAt,
    notesText,
    questionCount,
    quizType,
    sourceType,
    topic,
    view,
  ]);

  // Hidden pre-load drawer: opens only via Ctrl+Shift+M or ?preload=1 query.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const openTimer = urlParams.get("preload") === "1"
      ? window.setTimeout(() => setShowPreloadDrawer(true), 0)
      : undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && (event.key === "M" || event.key === "m")) {
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName?.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) return;
        event.preventDefault();
        setShowPreloadDrawer((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (openTimer !== undefined) window.clearTimeout(openTimer);
    };
  }, [view]);

  // Keep the prepared-materials list fresh while any material is still processing.
  useEffect(() => {
    if (!preparedMaterials.some((material) => material.status === "processing")) return;
    const interval = window.setInterval(() => {
      void loadMaterials();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [preparedMaterials, loadMaterials]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const computeFileFingerprint = async (file: File): Promise<FileFingerprint> => {
    try {
      if (typeof crypto !== "undefined" && crypto.subtle) {
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const hex = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        return { key: hex, kind: "sha256" };
      }
    } catch {
      // Fall through to the filename-based fingerprint below.
    }
    return { key: file.name.toLowerCase(), kind: "filename" };
  };

  const findMaterialByFingerprint = (
    materials: PreparedMaterial[],
    fingerprint: FileFingerprint
  ): PreparedMaterial | undefined =>
    materials.find((material) =>
      fingerprint.kind === "sha256"
        ? material.file_hash === fingerprint.key
        : material.filename.toLowerCase() === fingerprint.key
    );

  const awaitMaterialReady = async (materialId: number): Promise<boolean> => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const materials = await fetchMaterials();
      void loadMaterials();
      const material = materials.find((entry) => entry.id === materialId);
      if (!material || material.status === "failed") return false;
      if (material.status === "ready") return true;
    }
    return false;
  };

  const runSilentAutoMatch = async (file: File, fingerprint: FileFingerprint): Promise<number | null> => {
    try {
      const materials = await fetchMaterials();
      const existing = findMaterialByFingerprint(materials, fingerprint);
      if (existing) {
        if (existing.status === "ready") {
          setSelectedMaterialId(existing.id);
          return existing.id;
        }
        if (existing.status === "failed") {
          await retryMaterial(existing.id);
          void loadMaterials();
        }
        const ready = await awaitMaterialReady(existing.id);
        if (ready) setSelectedMaterialId(existing.id);
        return ready ? existing.id : null;
      }

      // Not cached yet — silently pre-warm extraction before Generate is pressed.
      const base64 = await readFileAsBase64(file);
      const prepared = await prepareMaterial({
        filename: file.name,
        file_base64: base64,
        file_mime_type: file.type,
      });
      void loadMaterials();
      const ready = prepared.status === "ready" || (await awaitMaterialReady(prepared.id));
      if (ready) setSelectedMaterialId(prepared.id);
      return ready ? prepared.id : null;
    } catch {
      // Silent cache warm-up must never disturb the normal upload flow.
      return null;
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError("File size exceeds 15MB limit. Please upload a smaller PDF or image.");
      return;
    }

    setError("");
    setSelectedFile(file);
    setSelectedMaterialId(null);

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

    // Silent cache auto-match / background warm-up for PDF & DOCX sources.
    const isPreparable = /\.(pdf|docx)$/i.test(file.name) || file.type === "application/pdf";
    if (!isPreparable) return;
    void (async () => {
      const fingerprint = await computeFileFingerprint(file);
      await runSilentAutoMatch(file, fingerprint);
    })();
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileBase64(null);
    setFilePreviewUrl(null);
    setSelectedMaterialId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleBatchPreload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      /\.(pdf|docx)$/i.test(file.name)
    );
    event.target.value = "";
    if (files.length === 0) return;

    const queued: PreloadQueueItem[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      filename: file.name,
      status: "queued",
    }));
    setPreloadQueue((prev) => [...prev, ...queued]);

    // Process strictly one file at a time to avoid LLM rate limits and SQLite lock contention.
    preloadChainRef.current = preloadChainRef.current.then(async () => {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const item = queued[index];
        if (file.size > 15 * 1024 * 1024) {
          setPreloadQueue((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, status: "failed" } : entry))
          );
          continue;
        }
        setPreloadQueue((prev) =>
          prev.map((entry) => (entry.id === item.id ? { ...entry, status: "preparing" } : entry))
        );
        try {
          const base64 = await readFileAsBase64(file);
          let material = await prepareMaterial({
            filename: file.name,
            file_base64: base64,
            file_mime_type: file.type,
          });
          if (material.status === "failed") {
            material = await retryMaterial(material.id);
          }
          void loadMaterials();
          const ready =
            material.status === "ready" ||
            (material.status === "processing" && (await awaitMaterialReady(material.id)));
          setPreloadQueue((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: ready ? "ready" : "failed" }
                : entry
            )
          );
        } catch {
          setPreloadQueue((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, status: "failed" } : entry))
          );
        }
      }
    });
  };

  const handleRetryMaterial = async (id: number) => {
    try {
      await retryMaterial(id);
      await loadMaterials();
      window.setTimeout(async () => {
        await loadMaterials();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry material.");
    }
  };

  const handlePublish = async () => {
    // Validation
    if (sourceType === "topic" && !topic.trim()) {
      setError("Please specify an assessment topic or lesson title.");
      return;
    }
    if ((sourceType === "image" || sourceType === "pdf") && !fileBase64 && !selectedMaterialId) {
      setError(`Please upload a valid ${sourceType === "pdf" ? "PDF document" : "image"} first, or select a prepared material.`);
      return;
    }
    if (sourceType === "text" && !notesText.trim()) {
      setError("Please paste lecture notes or course text.");
      return;
    }
    const assignedEmails = [...new Set(
      assignedStudentEmails
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )];
    if (assignedEmails.length === 0 && !classroomId) {
      setError("Choose a class or enter at least one verified CvSU student email.");
      return;
    }
    if (assignedEmails.some((email) => !email.endsWith("@cvsu.edu.ph"))) {
      setError("Every assigned student must use a @cvsu.edu.ph email address.");
      return;
    }

    setElapsedSeconds(0);
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

      if (availableFrom && dueAt) {
        if (new Date(availableFrom).getTime() >= new Date(dueAt).getTime()) {
          setError("Available From must be earlier than the Deadline.");
          setIsLoading(false);
          return;
        }
      }

      const timerValidation = validateQuestionTimeLimitSeconds(
        questionTimeLimitSeconds,
        Boolean(timerInputRef.current?.validity.badInput)
      );
      if (!timerValidation.valid) {
        setTimerError(timerValidation.error);
        setError(timerValidation.error || "Please enter a valid positive whole number for the question time limit.");
        setIsLoading(false);
        timerInputRef.current?.focus();
        return;
      }
      setTimerError(null);

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
        material_id: selectedMaterialId ?? undefined,
        generation_mode: generationMode,
        course_code: courseCode.trim() || undefined,
        class_section: classSection.trim() || undefined,
        classroom_id: classroomId || undefined,
        available_from: availableFrom ? new Date(availableFrom).toISOString() : undefined,
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
        assigned_student_emails: assignedEmails,
        question_time_limit_seconds: timerValidation.value,
      };

      streamAbortRef.current?.abort();
      const abortController = new AbortController();
      streamAbortRef.current = abortController;
      let streamedAnyQuestion = false;
      setIsStreamingDraft(false);
      setStreamStatusMessage(null);

      let result;
      try {
        result = await publishQuizStream(payload, {
          signal: abortController.signal,
          onStatus: (message) => {
            setStreamStatusMessage(message);
          },
          onQuestion: (question) => {
            if (!streamedAnyQuestion) {
              streamedAnyQuestion = true;
              setIsStreamingDraft(true);
              setPreviewTopic(effectiveTopic);
              setPreviewQuizId(null);
              setPreviewReviewStatus("draft");
              setSuccessMessage(`Generating "${effectiveTopic}" draft...`);
              setPreviewQuestions([question]);
            } else {
              setPreviewQuestions((prev) => [...(prev ?? []), question]);
            }
          },
        });
      } catch (streamErr) {
        if (streamErr instanceof Error && streamErr.name === "AbortError") {
          setIsStreamingDraft(false);
          setStreamStatusMessage(null);
          return;
        }
        if (streamedAnyQuestion) {
          throw streamErr;
        }
        // Fallback automatically to non-streaming publishQuiz if the stream failed to start
        result = await publishQuiz(payload);
      } finally {
        if (streamAbortRef.current === abortController) {
          streamAbortRef.current = null;
        }
      }

      setIsStreamingDraft(false);
      setStreamStatusMessage(null);
      setFallbackNotice(result.fallback_notice || null);
      draftCompletedRef.current = true;
      clearDraft(draftKey);
      setPreviewQuestions(result.quiz.questions);
      setPreviewQuizId(result.quiz.id);
      setPreviewReviewStatus(result.quiz.review_status);
      setShowDraftNotice(false);
      setPreviewTopic(effectiveTopic);
      setSuccessMessage(`Assessment "${effectiveTopic}" is ready for faculty review.`);
      
      // Reset inputs
      setTopic("");
      setNotesText("");
      setQuestionTimeLimitSeconds("");
      setTimerError(null);
      handleClearFile();
      loadQuizzes();
    } catch (err) {
      setIsStreamingDraft(false);
      setStreamStatusMessage(null);
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

  const toggleQuizRetakes = async (quizId: string, currentAllowRetakes: boolean = false) => {
    try {
      const result = await fetch(`${API_URL}/faculty/quizzes/${quizId}/retakes`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("cvsu_token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: !currentAllowRetakes }),
      });
      const data = await result.json();
      if (!result.ok) {
        alert(data.detail || "Failed to toggle retakes.");
        return;
      }
      // Refresh the quizzes list
      loadQuizzes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle retakes.");
    }
  };

  const handleAssignStudent = async () => {
    if (!assigningQuiz) return;
    const normalizedEmail = studentEmail.trim().toLowerCase();
    if (!normalizedEmail.endsWith("@cvsu.edu.ph")) {
      setAssignmentError("Enter a verified @cvsu.edu.ph student email address.");
      return;
    }

    setAssigning(true);
    setAssignmentError("");
    try {
      const result = await assignStudentToQuiz(assigningQuiz.id, normalizedEmail);
      setAssignmentMessage(result.message);
      setStudentEmail("");
      setAssigningQuiz(null);
      loadQuizzes();
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : "Failed to assign assessment.");
    } finally {
      setAssigning(false);
    }
  };

  const getEffectivePoints = (ans: QuizAttemptAnswer) =>
    ans.is_overridden ? Number(ans.awarded_points ?? 0) : ans.is_correct ? 1 : 0;

  const computeItemTotal = (attempt: QuizAttemptItem) =>
    Number(
      (attempt.answers || [])
        .reduce((sum, ans) => sum + getEffectivePoints(ans), 0)
        .toFixed(2)
    );

  const updateAnswerOverride = (answerIndex: number, isOverridden: boolean, awardedPoints: number) => {
    if (!selectedAttempt) return;
    const clampedPoints = Math.min(1, Math.max(0, Number.isFinite(awardedPoints) ? awardedPoints : 0));
    const updatedAnswers = (selectedAttempt.answers || []).map((ans, idx) =>
      idx === answerIndex
        ? { ...ans, is_overridden: isOverridden, awarded_points: clampedPoints }
        : ans
    );
    const updatedAttempt: QuizAttemptItem = {
      ...selectedAttempt,
      answers: updatedAnswers,
    };
    updatedAttempt.final_score = computeItemTotal(updatedAttempt);
    setSelectedAttempt(updatedAttempt);
    setDrawerAttempts((prev) =>
      prev.map((a) => (a.attempt_id === updatedAttempt.attempt_id ? updatedAttempt : a))
    );
    setManualFinalScore(null);
  };

  const openSubmissionDrawer = async (quizId: string, quizTopic: string) => {
    setAssignmentError("");
    setDrawerQuiz({ id: quizId, topic: quizTopic });
    try {
      const data = await fetchQuizAttempts(quizId);
      const attempts = data.attempts || [];
      const first = attempts[0] ?? null;
      setDrawerAttempts(attempts);
      setSelectedAttempt(first);
      setFacultyRemarks(first?.faculty_remarks || "");
      setManualFinalScore(
        first && first.adjusted_score !== null && first.adjusted_score !== computeItemTotal(first)
          ? first.adjusted_score
          : null
      );
      setShowSubmissionDrawer(true);
    } catch (err) {
      setDrawerAttempts([]);
      setSelectedAttempt(null);
      setManualFinalScore(null);
      setAssignmentError(err instanceof Error ? err.message : "Failed to load submissions.");
    }
  };

  const saveAttemptGrade = async () => {
    if (!selectedAttempt) return;
    setIsSavingGrade(true);
    try {
      const overrides = (selectedAttempt.answers || []).map((ans, idx) => ({
        answer_index: idx,
        is_overridden: Boolean(ans.is_overridden),
        awarded_points: getEffectivePoints(ans),
      }));
      await gradeFacultyAttempt(
        selectedAttempt.attempt_id,
        overrides,
        manualFinalScore !== null ? manualFinalScore : undefined,
        facultyRemarks,
        true
      );
      await queryClient.invalidateQueries({ queryKey: ["grades"] });
      setShowSubmissionDrawer(false);
      setDrawerQuiz(null);
      setDrawerAttempts([]);
      setSelectedAttempt(null);
      setManualFinalScore(null);
      setFacultyRemarks("");
      loadQuizzes();
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : "Failed to save grade.");
    } finally {
      setIsSavingGrade(false);
    }
  };

  if (view === "published") {
    const normalizedSearch = assessmentSearch.trim().toLowerCase();
    const filteredQuizzes = quizzes.filter((quiz) =>
      [quiz.topic, quiz.quiz_type, quiz.created_by_email]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch))
    );

    return (
      <div className="view-transition space-y-8">
        <div className="border-b border-stone-200 pb-6">
          <p className="text-sm font-semibold text-cvsu-green">
            Hi there, {currentUser?.full_name || currentUser?.name || "Faculty"}!
          </p>
          <h2 className="mt-2 font-syne text-2xl tracking-tight text-[#1C1C1C]">
            Published Assessments
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Manage the assessments currently available to your students.
          </p>
        </div>
        {assignmentMessage && (
          <div className="rounded-2xl border border-cvsu-green/30 bg-cvsu-light px-4 py-3 text-xs font-semibold text-cvsu-green" role="status">
            {assignmentMessage}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-syne text-sm uppercase tracking-wider text-[#1C1C1C]">
            Class Assessments ({filteredQuizzes.length}{assessmentSearch.trim() ? ` of ${quizzes.length}` : ""})
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block">
              <span className="sr-only">Search assessments</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">⌕</span>
              <input
                type="search"
                value={assessmentSearch}
                onChange={(event) => setAssessmentSearch(event.target.value)}
                placeholder="Search assessments..."
                className="w-full rounded-full border border-stone-300 bg-white py-2 pl-8 pr-4 text-xs text-[#1C1C1C] outline-none transition focus:border-cvsu-green focus:ring-4 focus:ring-cvsu-green/10 sm:w-64"
              />
            </label>
            <button
              type="button"
              onClick={() => loadQuizzes()}
              disabled={loadingQuizzes}
              className="flex items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-[#F7F7F2] px-3 py-1.5 text-xs font-bold text-stone-700 transition-colors hover:bg-stone-200"
            >
              <IconRefresh size={13} className={loadingQuizzes ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
        {quizzes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-[#F7F7F2]/60 p-10 text-center text-xs text-stone-500">
            No assessments published yet. Use Generate to create your first assessment.
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-[#F7F7F2]/60 p-10 text-center text-xs text-stone-500">
            No assessments match “{assessmentSearch}”.
          </div>
        ) : (
          <div className="divide-y divide-stone-200 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs">
            {filteredQuizzes.map((quiz) => (
              <div key={quiz.id} className="flex flex-col justify-between gap-4 p-5 transition-colors hover:bg-[#F7F7F2]/60 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[#1C1C1C]">{quiz.topic}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cvsu-green/30 bg-cvsu-light px-2.5 py-0.5 text-[11px] font-bold text-cvsu-green">
                      {quiz.quiz_type}
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      quiz.review_status === "published"
                        ? "border-cvsu-green/30 bg-cvsu-light text-cvsu-green"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}>
                      {quiz.review_status === "published" ? "Verified & Published" : "Pending Review"}
                    </span>
                    <span className="font-mono text-xs text-stone-500">{quiz.question_count} Questions</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      quiz.question_time_limit_seconds
                        ? "border-stone-300 bg-[#F7F7F2] text-stone-600"
                        : "border-dashed border-stone-200 text-stone-400"
                    }`}>
                      {quiz.question_time_limit_seconds ? `${quiz.question_time_limit_seconds}s per question` : "Untimed"}
                    </span>
                    <span className="font-mono text-xs text-stone-500">
                      {quiz.assigned_count ?? quiz.assigned_student_emails?.length ?? 0} assigned
                    </span>
                    {quiz.due_at && (
                      <span className="font-mono text-xs font-semibold text-amber-700">
                        Due: {formatManilaDateTime(quiz.due_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                  <button type="button" onClick={() => { setAssignmentError(""); setAssigningQuiz(quiz); }} className="rounded-full border border-cvsu-green/40 bg-cvsu-light px-4 py-2 text-xs font-bold text-cvsu-green hover:bg-cvsu-green hover:text-white">
                    Assign student
                  </button>
                  <button type="button" onClick={() => setEditingQuiz({ id: quiz.id, topic: quiz.topic })} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
                    Edit
                  </button>
                  <button type="button" onClick={() => router.push(`/quiz/${quiz.id}?preview=teacher`)} className="rounded-full border border-cvsu-green bg-cvsu-green px-4 py-2 text-xs font-bold text-white hover:bg-cvsu-dark">
                    {quiz.review_status === "published" ? "Preview" : "Review"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleQuizRetakes(quiz.id, Boolean(quiz.allow_retakes))}
                    className={`rounded-full border border-cvsu-green/40 bg-cvsu-light px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 btn-tactile hover:-translate-y-0.5 cursor-pointer ${
                      quiz.allow_retakes
                        ? "bg-cvsu-green text-white"
                        : "border-cvsu-green text-cvsu-green"
                    }`}
                  >
                    <span className={quiz.allow_retakes ? "text-white" : "text-cvsu-green"}>
                      {quiz.allow_retakes ? "Retakes: On" : "Retakes: Off"}
                    </span>
                  </button>
                  <button type="button" onClick={() => handleDeleteQuiz(quiz.id, quiz.topic)} disabled={deletingId === quiz.id} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                    {deletingId === quiz.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {editingQuiz && (
          <AssessmentEditorModal
            quizId={editingQuiz?.id ?? ""}
            initialTopic={editingQuiz?.topic ?? ""}
            onClose={() => setEditingQuiz(null)}
            onSaved={async () => {
              await loadQuizzes();
            }}
          />
        )}
        {assigningQuiz && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="assign-student-title">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
              <h3 id="assign-student-title" className="font-syne text-lg text-[#1C1C1C]">Assign existing assessment</h3>
              <p className="mt-1 text-xs text-stone-500">
                Assign “{assigningQuiz.topic}” to a specific student without creating another assessment.
              </p>
              <label htmlFor="student-email" className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-700">
                Student CvSU email
              </label>
              <input
                id="student-email"
                type="email"
                autoFocus
                value={studentEmail}
                onChange={(event) => setStudentEmail(event.target.value)}
                placeholder="student@cvsu.edu.ph"
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-[#1C1C1C] outline-none focus:border-cvsu-green focus:ring-4 focus:ring-cvsu-green/10"
              />
              {assignmentError && <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{assignmentError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => { setAssigningQuiz(null); setStudentEmail(""); setAssignmentError(""); }} className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
                  Cancel
                </button>
                <button type="button" onClick={handleAssignStudent} disabled={assigning} className="rounded-full bg-cvsu-green px-4 py-2 text-xs font-bold text-white hover:bg-cvsu-dark disabled:opacity-50">
                  {assigning ? "Assigning..." : "Assign assessment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Preview Mode when assessment generated
  if (previewQuestions && successMessage) {
    const handlePublishReviewedAssessment = async () => {
      if (!previewQuizId) return;
      setIsLoading(true);
      setError("");
      try {
        await publishAssessment(previewQuizId);
        setPreviewReviewStatus("published");
        setSuccessMessage(`Assessment "${previewTopic}" was approved and published.`);
        await loadQuizzes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to publish assessment.");
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <div className="view-transition space-y-6">
        <div className="p-5 bg-cvsu-dark border border-cvsu-vibrant/30 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-white shadow-md">
          <div className="flex items-start gap-3.5">
            <IconCheckCircle size={22} className="text-cvsu-vibrant shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-cvsu-vibrant">{successMessage}</p>
              <p className="text-xs text-white/70 mt-0.5">
                {isStreamingDraft
                  ? (streamStatusMessage || "Questions are appearing live as each section finishes.")
                  : previewReviewStatus === "draft"
                    ? "Review the generated content and answer key before making it available to students."
                    : "This assessment has been verified and published to the assigned students."}
              </p>
            </div>
          </div>
          {isStreamingDraft && (
            <span className="inline-flex items-center gap-2 rounded-full border border-cvsu-vibrant/40 bg-white/10 px-3 py-1 text-xs font-semibold text-cvsu-vibrant">
              <span className="h-2 w-2 rounded-full bg-cvsu-vibrant animate-pulse" />
              Generating remaining questions...
            </span>
          )}
        </div>

        <TeacherQuizPreview
          topic={previewTopic}
          questions={previewQuestions}
          quizType={quizType}
          onBack={() => {
            streamAbortRef.current?.abort();
            setIsStreamingDraft(false);
            setStreamStatusMessage(null);
            setPreviewQuestions(null);
            setSuccessMessage("");
            setPreviewQuizId(null);
            setPreviewReviewStatus("draft");
          }}
        />

        {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700" role="alert">{error}</p>}

        {previewQuizId && !isStreamingDraft && previewReviewStatus === "draft" && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setEditingQuiz({ id: previewQuizId, topic: previewTopic })}
              className="flex-1 rounded-full border border-stone-300 bg-white px-6 py-3.5 text-sm font-bold text-stone-700 transition-colors hover:border-cvsu-green hover:text-cvsu-green"
            >
              Edit questions and answer keys
            </button>
            <button
              type="button"
              onClick={handlePublishReviewedAssessment}
              disabled={isLoading}
              className="flex-1 rounded-full border border-cvsu-vibrant/30 bg-cvsu-green px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-cvsu-dark disabled:opacity-50"
            >
              {isLoading ? "Publishing..." : "Approve & Publish"}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            streamAbortRef.current?.abort();
            setIsStreamingDraft(false);
            setStreamStatusMessage(null);
            setPreviewQuestions(null);
            setSuccessMessage("");
            setPreviewQuizId(null);
            setPreviewReviewStatus("draft");
          }}
          className="w-full bg-cvsu-green hover:bg-cvsu-dark text-white font-bold py-3.5 px-6 rounded-full text-sm transition-all btn-tactile hover:-translate-y-0.5 flex items-center justify-center gap-2 shadow-md cursor-pointer border border-cvsu-vibrant/30"
        >
          <IconPlus size={16} className="text-cvsu-vibrant" />
          <span>Create Another Assessment</span>
        </button>

        {editingQuiz && previewQuizId && (
          <AssessmentEditorModal
            quizId={previewQuizId}
            initialTopic={previewTopic}
            onClose={() => setEditingQuiz(null)}
            onSaved={async () => {
              const updated = await fetchQuizAnswers(previewQuizId);
              setPreviewTopic(updated.topic);
              setPreviewQuestions(updated.questions);
              await loadQuizzes();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="view-transition space-y-8">
      {showSubmissionDrawer && drawerQuiz && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submission-drawer-title"
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="relative p-6 pr-14 border-b border-stone-200 bg-cvsu-dark text-white shrink-0">
              <h3 id="submission-drawer-title" className="font-syne text-lg truncate">
                Submissions &amp; Grading — {drawerQuiz.topic}
              </h3>
              {selectedAttempt && (
                <p className="text-xs text-white/75 mt-1">
                  {selectedAttempt.student_name} ({selectedAttempt.student_email})
                </p>
              )}
              <button
                type="button"
                aria-label="Close submissions dialog"
                onClick={() => setShowSubmissionDrawer(false)}
                className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {drawerAttempts.length > 1 && (
              <div className="px-6 py-3 bg-[#F7F7F2] border-b border-stone-200 flex flex-wrap gap-2 shrink-0">
                {drawerAttempts.map((attempt) => {
                  const isCurrent = selectedAttempt?.attempt_id === attempt.attempt_id;
                  return (
                    <button
                      key={attempt.attempt_id}
                      type="button"
                      onClick={() => {
                        setSelectedAttempt(attempt);
                        setFacultyRemarks(attempt.faculty_remarks || "");
                        setManualFinalScore(
                          attempt.adjusted_score !== null && attempt.adjusted_score !== computeItemTotal(attempt)
                            ? attempt.adjusted_score
                            : null
                        );
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                        isCurrent
                          ? "bg-cvsu-green text-white border-cvsu-green"
                          : "bg-white text-stone-700 border-stone-300 hover:border-cvsu-green"
                      }`}
                    >
                      {attempt.student_name} ({attempt.final_score}/{attempt.total_items})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-6 flex-1 overflow-y-auto">
              {!selectedAttempt ? (
                <div className="py-10 text-center space-y-4">
                  <p className="text-sm font-semibold text-stone-700">
                    No student submissions recorded yet for this assessment.
                  </p>
                  <p className="text-xs text-stone-500">
                    Once students complete this assessment, their responses will appear here for grading and verification.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubmissionDrawer(false);
                      onViewGrades();
                    }}
                    className="px-5 py-2 rounded-full bg-cvsu-green hover:bg-cvsu-dark text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Open Full Gradebook
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedAttempt.answers?.length ? (
                    selectedAttempt.answers.map((item, idx) => {
                      const effectivePoints = getEffectivePoints(item);
                      const isEffectiveCorrect = effectivePoints > 0;
                      return (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border text-xs space-y-2 transition-all ${
                          isEffectiveCorrect ? "bg-white border-stone-200" : "bg-red-50/50 border-red-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 font-bold text-[#1C1C1C] flex-1 min-w-0">
                            {isEffectiveCorrect ? (
                              <IconCheckCircle size={18} className="text-cvsu-green shrink-0 mt-0.5" />
                            ) : (
                              <span className="text-red-600 shrink-0 mt-0.5 font-bold">✕</span>
                            )}
                            <span>{idx + 1}. {item.question}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                updateAnswerOverride(idx, true, isEffectiveCorrect ? 0 : 1)
                              }
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                                isEffectiveCorrect
                                  ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                  : "bg-cvsu-light text-cvsu-green border-cvsu-green/30 hover:bg-cvsu-green hover:text-white"
                              }`}
                            >
                              {isEffectiveCorrect ? "Mark Incorrect" : "Mark Correct"}
                            </button>
                            <label className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                              <span>Pts:</span>
                              <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.5}
                                aria-label={`Points for question ${idx + 1}`}
                                value={effectivePoints}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateAnswerOverride(idx, true, Number.isNaN(val) ? 0 : val);
                                }}
                                className="w-11 text-center font-mono font-bold text-[#1C1C1C] bg-transparent outline-none"
                              />
                            </label>
                            {item.is_overridden && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateAnswerOverride(idx, false, item.is_correct ? 1 : 0)
                                }
                                className="px-2 py-1 rounded-full text-[11px] font-semibold text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="pl-6 space-y-1">
                          <p className="text-stone-600">
                            Submitted Answer:{" "}
                            <span className="font-bold text-[#1C1C1C]">
                              {item.user_answer || "—"}
                            </span>
                          </p>
                          <p className="text-stone-500">
                            Correct Model Answer:{" "}
                            <span className="font-bold">{item.correct_answer}</span>
                          </p>
                          <p className="text-stone-500">
                            Status:{" "}
                            <span className={`font-bold ${isEffectiveCorrect ? "text-cvsu-green" : "text-red-600"}`}>
                              {item.is_overridden
                                ? `Overridden (${effectivePoints} pt${effectivePoints === 1 ? "" : "s"})`
                                : item.is_correct
                                  ? "Auto-graded correct"
                                  : "Auto-graded incorrect"}
                            </span>
                          </p>
                        </div>
                      </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-stone-500 text-center py-6">
                      No itemized answer breakdown recorded for this submission.
                    </p>
                  )}
                </div>
              )}
            </div>

            {selectedAttempt && (
              <div className="p-6 border-t border-stone-200 bg-white shrink-0">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-stone-500">
                      AI Score: {selectedAttempt.ai_score ?? selectedAttempt.raw_score} / {selectedAttempt.total_items}
                    </p>
                    <p className="text-sm text-stone-500">
                      Raw Score: {selectedAttempt.raw_score} / {selectedAttempt.total_items}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="faculty-final-score" className="text-sm font-bold text-[#1C1C1C]">
                        Final Score:
                      </label>
                      <input
                        id="faculty-final-score"
                        type="number"
                        min={0}
                        max={selectedAttempt.total_items}
                        step={0.5}
                        value={manualFinalScore ?? computeItemTotal(selectedAttempt)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isNaN(val)) {
                            setManualFinalScore(0);
                          } else {
                            setManualFinalScore(Math.min(selectedAttempt.total_items, Math.max(0, val)));
                          }
                        }}
                        className="w-16 rounded-xl border border-stone-300 px-2.5 py-1 text-sm font-mono font-bold text-[#1C1C1C] outline-none focus:border-cvsu-green focus:ring-2 focus:ring-cvsu-green/10"
                      />
                      <span className="text-sm font-bold text-[#1C1C1C]">
                        / {selectedAttempt.total_items}
                      </span>
                      {manualFinalScore !== null && (
                        <button
                          type="button"
                          onClick={() => setManualFinalScore(null)}
                          className="text-xs font-semibold text-stone-500 hover:text-cvsu-green underline cursor-pointer"
                        >
                          Auto
                        </button>
                      )}
                      {selectedAttempt.grading_status === "teacher_reviewed" && (
                        <span className="text-xs font-semibold text-cvsu-green">(Teacher-reviewed)</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 sm:max-w-md space-y-2">
                    <textarea
                      value={facultyRemarks || ""}
                      onChange={(e) => setFacultyRemarks(e.target.value)}
                      placeholder="Enter faculty remarks..."
                      className="w-full rounded-2xl border border-stone-300 px-4 py-2 text-sm outline-none focus:border-cvsu-green focus:ring-2 focus:ring-cvsu-green/10"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSubmissionDrawer(false);
                          onViewGrades();
                        }}
                        className="px-4 py-2 border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-full transition-colors cursor-pointer"
                      >
                        Full Gradebook
                      </button>
                      <button
                        type="button"
                        disabled={isSavingGrade}
                        onClick={() => saveAttemptGrade()}
                        className="px-6 py-2 bg-cvsu-green hover:bg-cvsu-dark text-white text-xs font-bold rounded-full transition-all flex items-center gap-2 shadow-md btn-tactile cursor-pointer disabled:opacity-50"
                      >
                        {isSavingGrade ? "Saving..." : "Verify & Save Grade"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showDraftNotice && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-cvsu-green/30 bg-cvsu-light px-4 py-3 text-xs font-semibold text-cvsu-green" role="status">
          <span>Your unfinished assessment draft was restored.</span>
          <button type="button" onClick={() => { clearDraft(draftKey); setShowDraftNotice(false); }} className="font-bold underline">
            Discard draft
          </button>
        </div>
      )}
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <p className="text-sm font-semibold text-cvsu-green">
            Hi there, {currentUser?.full_name || currentUser?.name || "Faculty"}!
          </p>
          <h2 className="font-syne text-2xl tracking-tight text-[#1C1C1C]">Faculty Assessment Studio</h2>
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
                  ? "border-cvsu-dark bg-cvsu-dark text-white shadow-md ring-2 ring-cvsu-green/20"
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
                  ? "border-cvsu-dark bg-cvsu-dark text-white shadow-md ring-2 ring-cvsu-green/20"
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
                  ? "border-cvsu-dark bg-cvsu-dark text-white shadow-md ring-2 ring-cvsu-green/20"
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
                  ? "border-cvsu-dark bg-cvsu-dark text-white shadow-md ring-2 ring-cvsu-green/20"
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
                {sourceType === "pdf" ? "PDF, DOCX (Max 15MB)" : "JPG, PNG, WEBP (Max 15MB)"}
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept={
                sourceType === "pdf"
                  ? "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  : "image/png,image/jpeg,image/jpg,image/webp"
              }
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
                    Groq will extract concepts and synthesize balanced questions strictly from this source.
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
                      ? "border-cvsu-dark bg-cvsu-dark text-white shadow-md ring-2 ring-cvsu-green/20"
                      : "border-stone-200 bg-white hover:border-cvsu-green/50 hover:bg-[#F7F7F2] text-[#1C1C1C] shadow-xs"
                  }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 transition-colors ${
                    isSelected ? "bg-white text-cvsu-dark" : "bg-stone-100 text-stone-600 group-hover:bg-cvsu-light group-hover:text-cvsu-green"
                  }`}>
                    {format.icon}
                  </div>
                  <div>
                    <p className={`text-sm font-bold tracking-tight transition-colors ${isSelected ? "text-white" : "text-[#1C1C1C]"}`}>
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
                <h3 className="font-syne text-sm text-[#1C1C1C] uppercase tracking-wider">
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
            <p className={`text-[11px] mt-1 ${totalMixedCount > 50 ? "text-amber-700 font-semibold" : "text-stone-400"}`}>
              {totalMixedCount > 50
                ? `Over the ${50}-question limit for this deployment — reduce section counts before generating.`
                : `Up to ${50} questions per assessment on this deployment.`}
            </p>

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

        <div className="p-5 bg-[#F7F7F2] border border-stone-200 rounded-2xl space-y-2.5">
          <label
            htmlFor="create-question-time-limit"
            className="text-xs font-bold text-stone-700 block uppercase tracking-wider"
          >
            Time Limit per Question (Seconds)
          </label>
          <p id="create-question-time-limit-hint" className="text-xs text-stone-500">
            Enter a positive whole number of seconds (1 or more), or leave blank for untimed.
          </p>
          <input
            ref={timerInputRef}
            id="create-question-time-limit"
            name="question_time_limit_seconds"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={questionTimeLimitSeconds}
            onChange={(e) => {
              const next = e.target.value;
              setQuestionTimeLimitSeconds(next);
              if (timerError) {
                const check = validateQuestionTimeLimitSeconds(next, e.target.validity.badInput);
                if (check.valid) setTimerError(null);
              }
            }}
            onBlur={(e) => {
              const check = validateQuestionTimeLimitSeconds(
                e.currentTarget.value,
                e.currentTarget.validity.badInput
              );
              setTimerError(check.valid ? null : check.error);
            }}
            aria-invalid={timerError ? "true" : "false"}
            aria-describedby={
              timerError
                ? "create-question-time-limit-hint create-question-time-limit-error"
                : "create-question-time-limit-hint"
            }
            placeholder="No time limit"
            className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#1C1C1C] outline-none focus:ring-2 ${
              timerError
                ? "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/15"
                : "border-stone-300 focus:border-cvsu-green focus:ring-cvsu-green/10"
            }`}
          />
          {timerError && (
            <p id="create-question-time-limit-error" className="text-xs font-semibold text-red-600">
              {timerError}
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-950">4. Assignment access</p>
            <p className="mt-1 text-xs text-amber-900/80">Choose a class for late-enrollee access, or assign individual CvSU accounts. Students can see the assessment only during the availability window.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input aria-label="Course code" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="Course code (optional)" className="rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cvsu-green/20" />
            <input aria-label="Class section" value={classSection} onChange={(e) => setClassSection(e.target.value)} placeholder="Section (optional)" className="rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cvsu-green/20" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 items-end">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-amber-950 block">Class / Cohort</label>
              <select aria-label="Assign to class" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cvsu-green/20">
                <option value="">Individual students</option>
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name} ({classroom.invite_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-amber-950 block">Available From</label>
              <input aria-label="Available from" type="datetime-local" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cvsu-green/20" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-amber-950 block">Deadline / Due Date</label>
              <input aria-label="Due date" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cvsu-green/20" />
            </div>
          </div>
          {availableFrom && dueAt && new Date(availableFrom).getTime() >= new Date(dueAt).getTime() && (
            <p className="text-xs font-semibold text-red-600">
              ⚠️ Available From must be earlier than the Deadline.
            </p>
          )}
          {!classroomId && (
            <textarea aria-label="Assigned student emails" value={assignedStudentEmails} onChange={(e) => setAssignedStudentEmails(e.target.value)} placeholder="Optional individual student emails, separated by commas or spaces" rows={3} className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cvsu-green/20" />
          )}
        </div>

        {/* Generation Mode Selector */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
          <p className="text-[11px] font-bold text-amber-950 uppercase tracking-wider">Generation Mode</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setGenerationMode("fast")}
              className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${generationMode === "fast" ? "border-cvsu-green bg-cvsu-light text-cvsu-dark" : "border-amber-200 bg-white text-slate-700"}`}
            >
              Fast Mode
              <span className="block text-[10px] font-medium text-slate-500">Best for lectures, readings, and text-only files (faster)</span>
            </button>
            <button
              type="button"
              onClick={() => setGenerationMode("complex")}
              className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${generationMode === "complex" ? "border-cvsu-green bg-cvsu-light text-cvsu-dark" : "border-amber-200 bg-white text-slate-700"}`}
            >
              Complex Mode
              <span className="block text-[10px] font-medium text-slate-500">Best for math, diagrams, tables, and scanned PDFs (deeper reasoning)</span>
            </button>
          </div>
        </div>

        {fallbackNotice && (
          <p className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            {fallbackNotice}
          </p>
        )}

        {/* Generate Button with CvSU Primary Styling */}
        <button
          type="button"
          onClick={handlePublish}
          disabled={isLoading}
          className="w-full bg-cvsu-dark hover:bg-cvsu-green text-white font-extrabold py-4 px-8 rounded-full text-sm sm:text-base transition-all shadow-lg hover:shadow-xl btn-tactile hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 cursor-pointer group border border-cvsu-green/30"
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
            {generationMode === "complex"
              ? "Complex Mode is running parallel section reasoning. Scanned or visual PDFs may take up to 65s; please keep this tab open."
              : "AI is generating questions. Large or scanned PDFs may take longer; please keep this tab open."}
          </p>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center gap-2 view-transition">
            <span className="shrink-0 text-base leading-none"></span>
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Submissions & Grading Drawer Section */}
      {(() => {
        const submissionQuizzes = quizzes.filter(
          (quiz) =>
            quiz.review_status === "published" &&
            ((quiz.assigned_count ?? quiz.assigned_student_emails?.length ?? 0) > 0 ||
              Boolean(quiz.classroom_id))
        );
        if (submissionQuizzes.length === 0) return null;
        return (
          <div className="space-y-6 pb-8">
            <div className="border-b border-stone-200 pb-3">
              <h3 className="font-syne text-sm text-[#1C1C1C] uppercase tracking-wider">
                Submissions &amp; Grading
              </h3>
              <p className="text-xs text-stone-500">
                Review and grade student attempts for published assessments.
              </p>
            </div>
            <div className="divide-y divide-stone-200 rounded-3xl border border-stone-200 overflow-hidden bg-white shadow-xs">
              {submissionQuizzes.map((quiz) => {
                const assignedTotal = quiz.assigned_count ?? quiz.assigned_student_emails?.length ?? 0;
                return (
                  <div
                    key={quiz.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 last:border-0"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <p className="truncate text-sm font-bold text-[#1C1C1C]">{quiz.topic}</p>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-full border border-cvsu-green/30 bg-cvsu-light px-3 py-0.5 text-[11px] font-bold text-cvsu-green">
                          {quiz.quiz_type}
                        </span>
                        <span className="font-mono text-xs text-stone-500">
                          {quiz.question_count} Questions
                        </span>
                        <span className="text-stone-500 font-mono text-[11px]">
                          {assignedTotal} assigned
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => openSubmissionDrawer(quiz.id, quiz.topic)}
                        className="px-4 py-2 bg-cvsu-green hover:bg-cvsu-dark text-white text-xs font-bold rounded-full transition-all flex items-center gap-1.5 btn-tactile cursor-pointer shadow-sm hover:shadow-md"
                      >
                        View Submissions
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {false && (
        <>
      {/* Published Assessments List */}
      <div id="published" className="scroll-mt-24 pt-8 border-t border-stone-200">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-syne text-sm text-[#1C1C1C] uppercase tracking-wider">
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
                    onClick={() => setEditingQuiz({ id: q.id, topic: q.topic })}
                    className="px-4 py-2 bg-white hover:bg-stone-50 text-stone-700 hover:text-cvsu-dark border border-stone-200 hover:border-stone-300 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 btn-tactile hover:-translate-y-0.5 shadow-xs cursor-pointer"
                  >
                    <IconEdit size={14} />
                    <span>Edit</span>
                  </button>
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
        </>
      )}

      {/* Hidden Material Pre-Load Drawer (Ctrl+Shift+M or ?preload=1) */}
      {showPreloadDrawer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preload-drawer-title"
        >
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="preload-drawer-title" className="font-syne text-lg text-[#1C1C1C]">
                  Material Pre-Load Manager
                </h3>
                <p className="mt-1 text-xs text-stone-500">
                  Cache course PDFs/DOCX files so generation reuses them instantly. Press{" "}
                  <kbd className="rounded border border-stone-300 bg-[#F7F7F2] px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-700">
                    Ctrl + Shift + M
                  </kbd>{" "}
                  to reopen this drawer.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close pre-load manager"
                onClick={() => setShowPreloadDrawer(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-stone-600 hover:text-stone-800 border border-stone-200 font-bold flex items-center justify-center text-xs shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-[#F7F7F2]/60 px-4 py-5 text-xs font-bold text-stone-600 hover:border-cvsu-green hover:text-cvsu-green transition-colors">
              <IconUpload size={16} />
              Select one or more PDF / DOCX files to pre-load
              <input
                ref={materialInputRef}
                type="file"
                multiple
                accept=".pdf,.docx"
                onChange={handleBatchPreload}
                className="hidden"
              />
            </label>
            <p className="mt-1.5 text-[11px] text-stone-400">
              Files are processed one at a time to stay within AI rate limits.
            </p>

            {preloadQueue.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Batch queue</p>
                <ul className="mt-2 space-y-1.5">
                  {preloadQueue.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-[#F7F7F2]/60 px-3 py-2 text-xs"
                    >
                      <span className="truncate font-mono text-[#1C1C1C]">{item.filename}</span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          item.status === "queued"
                            ? "border-stone-300 bg-white text-stone-600"
                            : item.status === "preparing"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : item.status === "ready"
                                ? "border-cvsu-green/30 bg-cvsu-light text-cvsu-green"
                                : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {item.status === "queued"
                          ? "Queued"
                          : item.status === "preparing"
                            ? "Preparing..."
                            : item.status === "ready"
                              ? "Ready ⚡"
                              : "Failed"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 border-t border-stone-200 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Prepared materials</p>
              {preparedMaterials.length === 0 ? (
                <p className="mt-2 text-[11px] text-stone-400">No prepared materials yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {preparedMaterials.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs"
                    >
                      <span className="truncate font-mono text-[#1C1C1C]">{m.filename}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.status === "processing" && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Preparing...</span>
                        )}
                        {m.status === "ready" && (
                          <span className="rounded-full border border-cvsu-green/30 bg-cvsu-light px-2 py-0.5 text-[10px] font-bold text-cvsu-green">Ready ⚡</span>
                        )}
                        {m.status === "failed" && (
                          <>
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Failed</span>
                            <button
                              type="button"
                              onClick={() => handleRetryMaterial(m.id)}
                              className="rounded-full border border-stone-300 bg-white px-2.5 py-0.5 text-[10px] font-bold text-stone-700 hover:bg-stone-100 cursor-pointer"
                            >
                              Retry
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {editingQuiz && (
        <AssessmentEditorModal
          quizId={editingQuiz?.id ?? ""}
          initialTopic={editingQuiz?.topic ?? ""}
          onClose={() => setEditingQuiz(null)}
          onSaved={() => {
            loadQuizzes();
          }}
        />
      )}
    </div>
  );
}
