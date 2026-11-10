import { API_URL, fetchWithAuth } from "@/lib/api";

export interface ReviewItem {
  id: string;
  item_key: string;
  prompt: string | null;
  topic: string | null;
  repetitions: number;
  interval_days: number;
  easiness: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
}

export async function fetchDueItems(limit = 50): Promise<ReviewItem[]> {
  return fetchWithAuth(`${API_URL}/srs/due?limit=${limit}`);
}

export async function submitReview(itemId: string, quality: number): Promise<ReviewItem> {
  return fetchWithAuth(`${API_URL}/srs/${itemId}/review`, {
    method: "POST",
    body: JSON.stringify({ quality }),
  });
}