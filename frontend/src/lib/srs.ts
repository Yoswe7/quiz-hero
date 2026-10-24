// Example usage on the client to fetch due items and submit a review
export async function fetchDueItems(): Promise<any> {
  const res = await fetch("/api/proxy/srs/due"); // adapt to your API proxy / base URL
  if (!res.ok) throw new Error("Failed to load due items");
  return res.json();
}

export async function submitReview(itemId: string, quality: number) {
  const res = await fetch(`/api/proxy/srs/${itemId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quality }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Review failed: ${body}`);
  }
  return res.json();
}