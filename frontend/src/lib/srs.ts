import { API_URL, fetchWithAuth } from "@/lib/api";

export interface ReviewItem {
  id: string;
  item_key: string;
  prompt: string | null;
  topic: string | null;
  correct_answer: string | null;
  explanation: string | null;
  repetitions: number;
  interval_days: number;
  easiness: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
}

export async function fetchDueItems(limit = 50): Promise<ReviewItem[]> {
  return fetchWithAuth(`${API_URL}/srs/due?limit=${limit}`);
}

export async function fetchAllReviewItems(limit = 100): Promise<ReviewItem[]> {
  return fetchWithAuth(`${API_URL}/srs/items?limit=${limit}`);
}

export async function submitReview(itemId: string, quality: number): Promise<ReviewItem> {
  return fetchWithAuth(`${API_URL}/srs/${itemId}/review`, {
    method: "POST",
    body: JSON.stringify({ quality }),
  });
}

export interface LessonSection {
  index: number;
  title: string;
  preview: string;
  content: string;
  char_count: number;
}

export interface SharedLesson {
  id: number;
  filename: string;
  created_by_email: string;
  created_at: string;
  char_count: number;
}

export interface LessonParseResponse {
  source_name: string;
  sections: LessonSection[];
}

export async function fetchSharedLessons(): Promise<SharedLesson[]> {
  return fetchWithAuth(`${API_URL}/srs/lessons/shared`);
}

export async function parseLessonSections(payload: {
  source_type: "text" | "file" | "material";
  text?: string;
  filename?: string;
  file_base64?: string;
  file_mime_type?: string;
  material_id?: number;
}): Promise<LessonParseResponse> {
  return fetchWithAuth(`${API_URL}/srs/lessons/parse`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateLessonFlashcards(payload: {
  topic: string;
  source_name?: string;
  selected_sections: Array<{ title: string; content: string }>;
  card_count: number;
}): Promise<ReviewItem[]> {
  return fetchWithAuth(`${API_URL}/srs/lessons/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}