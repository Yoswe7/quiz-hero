import {
  Question,
  PublishedQuiz,
  QuizDetail,
  GradeSubmission,
  GradeResult,
  AnswerDetail,
  CvSUUser,
  GoogleAuthPayload,
  QuizPublishPayload,
  FacultyAssignedAssessment,
  Classroom,
  ClassroomMember,
} from "@/types/quiz";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

// Helper to attach JWT token
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("cvsu_token") : null;
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { cache: "no-store", ...options, headers });
  
  if (!response.ok) {
    // Clear stored auth on 401 so stale tokens don't linger.
    if (response.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("cvsu_token");
      localStorage.removeItem("cvsu_user");
    }
    let errorDetail = "An error occurred";
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorData = await response.json();
        errorDetail = errorData.detail || errorDetail;
      } else {
        const text = await response.text();
        errorDetail = text || response.statusText || errorDetail;
      }
    } catch {
      errorDetail = response.statusText || errorDetail;
    }
    throw new ApiError(errorDetail, response.status);
  }
  
  // Handle empty/non-JSON responses safely (e.g. 204 No Content).
  if (response.status === 204) {
    return null as any;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text as any;
    }
  }
  return response.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function authenticateCvSUGoogle(
  payload: GoogleAuthPayload
): Promise<CvSUUser> {
  const response = await fetch(`${API_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: payload.credential,
      auth_mode: payload.auth_mode,
      requested_role: payload.requested_role || "STUDENT",
      faculty_code: payload.faculty_code || null,
    }),
  });

  if (!response.ok) {
    let errorDetail = "Authentication failed. Access restricted to verified @cvsu.edu.ph Google accounts.";
    try {
      const err = await response.json();
      errorDetail = err.detail || errorDetail;
    } catch {
      // non-JSON response fallback
    }
    throw new ApiError(errorDetail, response.status);
  }

  return response.json();
}

export const verifyGoogleToken = authenticateCvSUGoogle;

export async function authenticateLocalTestStudent(): Promise<CvSUUser> {
  const response = await fetch(`${API_URL}/auth/dev/student`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new ApiError("Local student test authentication is disabled.", response.status);
  }

  return response.json();
}

export async function authenticateLocalTestTeacher(): Promise<CvSUUser> {
  const response = await fetch(`${API_URL}/auth/dev/teacher`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new ApiError("Local teacher test authentication is disabled.", response.status);
  }

  return response.json();
}

export async function fetchCurrentUser(): Promise<CvSUUser> {
  return fetchWithAuth(`${API_URL}/api/auth/me`);
}

export async function publishQuiz(
  payload: QuizPublishPayload
): Promise<{ quiz: { id: string; topic: string; quiz_type: string; question_count: number; review_status: "draft" | "published"; time_limit_minutes?: number | null; questions: Question[] }; fallback_notice?: string | null }> {
  return fetchWithAuth(`${API_URL}/publish-quiz`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function publishAssessment(
  quizId: string
): Promise<{ message: string; quiz_id: string }> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}/publish`, { method: "POST" });
}

export async function fetchQuizzes(): Promise<PublishedQuiz[]> {
  const data = await fetchWithAuth(`${API_URL}/quizzes`);
  return data.quizzes;
}

export async function fetchClassrooms(): Promise<Classroom[]> {
  return fetchWithAuth(`${API_URL}/classrooms`);
}

export async function createClassroom(payload: {
  name: string;
  course_code?: string;
  class_section?: string;
}): Promise<Classroom> {
  return fetchWithAuth(`${API_URL}/classrooms`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function joinClassroom(inviteCode: string): Promise<Classroom> {
  return fetchWithAuth(`${API_URL}/classrooms/join`, {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode }),
  });
}

export async function fetchClassroomMembers(classroomId: string): Promise<{
  classroom: Classroom;
  members: ClassroomMember[];
}> {
  const data = await fetchWithAuth(`${API_URL}/classrooms/${classroomId}/members`);
  return data;
}

export async function fetchFacultyAssignedAssessments(): Promise<FacultyAssignedAssessment[]> {
  const data = await fetchWithAuth(`${API_URL}/faculty-assigned-assessments`);
  return data.quizzes;
}

export async function fetchQuizDetail(quizId: string): Promise<QuizDetail> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}`);
}

export async function fetchQuizAnswers(
  quizId: string
): Promise<{ quiz_id: string; topic: string; quiz_type: string; questions: Question[] }> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}/answers`);
}

export async function fetchQuizAttempts(quizId: string): Promise<{
  attempts: {
    attempt_id: number;
    student_email: string;
    student_name: string;
    raw_score: number;
    adjusted_score: number | null;
    final_score: number;
    total_items: number;
    is_verified: boolean;
    faculty_remarks: string | null;
    reviewed_at: string | null;
    reviewed_by: number | null;
    answers: {
      question: string;
      user_answer: string;
      correct_answer: string;
      is_correct: boolean;
      is_overridden: boolean;
      awarded_points: number;
    }[];
  }[];
}> {
  return fetchWithAuth(`${API_URL}/faculty/quizzes/${quizId}/attempts`);
}

export async function gradeFacultyAttempt(
  attemptId: number,
  answerOverrides: { answer_index: number; is_overridden: boolean; awarded_points: number }[],
  adjustedScore?: number | null,
  facultyRemarks?: string | null,
  isVerified: boolean = true
): Promise<{ message: string; attempt_id: number; raw_score: number; adjusted_score: number | null; final_score: number; is_verified: boolean; faculty_remarks: string | null; reviewed_at: string | null }> {
  const params = new URLSearchParams();
  if (adjustedScore !== undefined && adjustedScore !== null) params.set("adjusted_score", String(adjustedScore));
  if (facultyRemarks !== undefined && facultyRemarks !== null) params.set("faculty_remarks", facultyRemarks);
  params.set("is_verified", String(isVerified));
  return fetchWithAuth(`${API_URL}/faculty/attempts/${attemptId}/grade?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify(answerOverrides),
  });
}

export async function updateQuiz(
  quizId: string,
  payload: {
    topic: string;
    questions: Question[];
    available_from?: string | null;
    due_at?: string | null;
    allow_retakes?: boolean;
    max_attempts?: number;
    time_limit_minutes?: number | null;
  }
): Promise<{ message: string; quiz_id: string; allow_retakes?: boolean; max_attempts?: number; time_limit_minutes?: number | null }> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function startQuizSession(quizId: string): Promise<{
  session_id?: number;
  time_limit_minutes?: number | null;
  started_at?: string | null;
  expires_at?: string | null;
  server_now?: string;
}> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}/start`, { method: "POST" });
}

export async function deleteQuiz(quizId: string): Promise<void> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}`, {
    method: "DELETE",
  });
}

export async function assignStudentToQuiz(
  quizId: string,
  studentEmail: string
): Promise<{ message: string; already_assigned: boolean }> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}/assign`, {
    method: "POST",
    body: JSON.stringify({ student_email: studentEmail }),
  });
}

export async function gradeAnswer(
  question: string,
  correctAnswer: string,
  userAnswer: string,
  quizType: string
): Promise<GradeResult> {
  return fetchWithAuth(`${API_URL}/grade-answer`, {
    method: "POST",
    body: JSON.stringify({
      question,
      correct_answer: correctAnswer,
      user_answer: userAnswer,
      quiz_type: quizType,
    }),
  });
}

export async function submitQuiz(
  quizId: string,
  topic: string,
  totalQuestions: number,
  answers: { question: string; user_answer: string }[] | AnswerDetail[]
): Promise<{
  message: string;
  status: string;
  score: number;
  total_questions: number;
  percentage: number;
  answers: AnswerDetail[];
  submission: GradeSubmission;
}> {
  return fetchWithAuth(`${API_URL}/submit-quiz`, {
    method: "POST",
    body: JSON.stringify({
      quiz_id: quizId,
      topic,
      total_questions: totalQuestions,
      answers,
    }),
  });
}

export async function fetchGrades(): Promise<GradeSubmission[]> {
  const data = await fetchWithAuth(`${API_URL}/grades`);
  return data.submissions;
}

export interface StudentProgress {
  summary: {
    assessments_completed: number;
    topics_started: number;
    average_percentage: number;
    study_streak_days: number;
  };
  srs: {
    total_items: number;
    due_reviews: number;
    reviewed_items: number;
    mastered_items: number;
    retention_percentage: number;
  };
  topics: {
    topic: string;
    attempts: number;
    average_percentage: number;
    best_percentage: number;
    last_percentage: number;
    last_completed_at: string | null;
    mastery: "Mastered" | "Developing" | "Needs review";
  }[];
  recommendations: { topic: string; reason: string }[];
}

export async function fetchStudentProgress(): Promise<StudentProgress> {
  return fetchWithAuth(`${API_URL}/progress`);
}

export interface ChatMessagePayload {
  role: "user" | "model" | "assistant";
  content: string;
}

export async function sendChatMessage(
  messages: { role: string; content: string }[],
  userName?: string,
  userRole?: string,
  contextTopic?: string,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 35_000);
  const abortRequest = () => controller.abort();
  signal?.addEventListener("abort", abortRequest, { once: true });

  try {
    const data = await fetchWithAuth(`${API_URL}/chat`, {
      method: "POST",
      body: JSON.stringify({
        messages,
        user_name: userName || "Student",
        user_role: userRole || "student",
        context_topic: contextTopic,
      }),
      signal: controller.signal,
    });

    return data.reply;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The AI service took too long to respond. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRequest);
  }
}
