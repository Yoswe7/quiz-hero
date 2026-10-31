export type QuizType =
  | "Multiple Choice"
  | "True or False"
  | "Identification"
  | "Open Ended"
  | "Mixed Assessment";

export type AuthMode = "signin" | "signup";
export type UserRole = "STUDENT" | "TEACHER" | "student" | "teacher";
export type SourceMaterialType = "topic" | "image" | "pdf" | "text";

export interface CvSUUser {
  id: number;
  google_sub?: string;
  email: string;
  name?: string;
  full_name: string;
  avatar_url?: string;
  picture_url?: string;
  role: string;
  token?: string;
}

export interface GoogleAuthPayload {
  credential: string;
  auth_mode: AuthMode;
  requested_role?: "STUDENT" | "TEACHER";
  faculty_code?: string;
}

export interface QuizSection {
  quiz_type: QuizType;
  question_count: number;
}

export interface QuizPublishPayload {
  topic?: string;
  question_count: number;
  quiz_type: QuizType;
  sections?: QuizSection[];
  created_by_email?: string;
  source_type?: "topic" | "file" | "text";
  content_text?: string;
  file_base64?: string;
  file_mime_type?: string;
  file_name?: string;
}

export interface Question {
  question: string;
  options: string[];
  answer: string;
  quiz_type?: QuizType;
  section_name?: string;
}

export interface StudentQuestion {
  question: string;
  options: string[];
  quiz_type?: QuizType;
  section_name?: string;
}

export interface PublishedQuiz {
  id: string;
  topic: string;
  quiz_type: QuizType;
  question_count: number;
  created_by_email?: string;
  created_at: string;
}

export interface QuizDetail {
  id: string;
  topic: string;
  quiz_type: QuizType;
  question_count: number;
  created_by_email?: string;
  created_at?: string;
  questions: StudentQuestion[];
}

export interface GradeSubmission {
  id?: number;
  student_name: string;
  student_email?: string;
  quiz_id: string;
  topic: string;
  score: number;
  total_questions: number;
  percentage: number;
  answers: AnswerDetail[];
  created_at?: string;
}

export interface AnswerDetail {
  question: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  ai_feedback?: string;
}

export interface GradeResult {
  is_correct: boolean;
  score?: number;
  feedback: string;
}
