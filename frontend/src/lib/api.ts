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
} from "@/types/quiz";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// Helper to attach JWT token
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("cvsu_token") : null;
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    let errorDetail = "An error occurred";
    try {
      const errorData = await response.json();
      errorDetail = errorData.detail || errorDetail;
    } catch {
      errorDetail = response.statusText || errorDetail;
    }
    throw new Error(errorDetail);
  }
  
  return response.json();
}

export async function authenticateCvSUGoogle(
  payload: GoogleAuthPayload
): Promise<CvSUUser> {
  const response = await fetch(`${API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Authentication failed" }));
    throw new Error(err.detail || "Authentication failed. Please verify your CvSU Google account.");
  }

  return response.json();
}

export const verifyGoogleToken = authenticateCvSUGoogle;

export async function fetchCurrentUser(): Promise<CvSUUser> {
  return fetchWithAuth(`${API_URL}/auth/me`);
}

export async function publishQuiz(
  payload: QuizPublishPayload
): Promise<{ quiz: { id: string; topic: string; quiz_type: string; questions: Question[] } }> {
  return fetchWithAuth(`${API_URL}/publish-quiz`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchQuizzes(): Promise<PublishedQuiz[]> {
  const data = await fetchWithAuth(`${API_URL}/quizzes`);
  return data.quizzes;
}

export async function fetchQuizDetail(quizId: string): Promise<QuizDetail> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}`);
}

export async function fetchQuizAnswers(quizId: string): Promise<{ questions: Question[] }> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}/answers`);
}

export async function deleteQuiz(quizId: string): Promise<void> {
  return fetchWithAuth(`${API_URL}/quizzes/${quizId}`, {
    method: "DELETE",
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
  studentName: string,
  studentEmail: string,
  quizId: string,
  topic: string,
  score: number,
  totalQuestions: number,
  answers: AnswerDetail[]
): Promise<void> {
  return fetchWithAuth(`${API_URL}/submit-quiz`, {
    method: "POST",
    body: JSON.stringify({
      student_name: studentName,
      student_email: studentEmail,
      quiz_id: quizId,
      topic,
      score,
      total_questions: totalQuestions,
      answers,
    }),
  });
}

export async function fetchGrades(): Promise<GradeSubmission[]> {
  const data = await fetchWithAuth(`${API_URL}/grades`);
  return data.submissions;
}

export interface ChatMessagePayload {
  role: "user" | "model" | "assistant";
  content: string;
}

export async function sendChatMessage(
  messages: { role: string; content: string }[],
  userName?: string,
  userRole?: string,
  contextTopic?: string
): Promise<string> {
  const data = await fetchWithAuth(`${API_URL}/chat`, {
    method: "POST",
    body: JSON.stringify({
      messages,
      user_name: userName || "Student",
      user_role: userRole || "student",
      context_topic: contextTopic,
    }),
  });
  return data.reply;
}
