"use client";

import { useEffect, useState } from "react";
import { fetchDueItems, ReviewItem, submitReview } from "@/lib/srs";
import { useAuth } from "@/lib/auth/AuthContext";
import { fetchStudentProgress, StudentProgress } from "@/lib/api";

const qualities = [
  ["0", "Blackout"],
  ["1", "Incorrect"],
  ["2", "Hard"],
  ["3", "Pass"],
  ["4", "Good"],
  ["5", "Easy"],
];

export default function ReviewPage() {
  const { user, isLoaded } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [recall, setRecall] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [lastScheduled, setLastScheduled] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const [dueItems, studentProgress] = await Promise.all([fetchDueItems(), fetchStudentProgress()]);
      setItems(dueItems);
      setProgress(studentProgress);
      setIndex(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load due reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded || !user) return;
    const timer = window.setTimeout(() => void loadItems(), 0);
    return () => window.clearTimeout(timer);
  }, [isLoaded, user]);

  if (!isLoaded || !user) return null;
  if (loading) return <div className="py-16 text-center text-cvsu-green">Loading due reviews...</div>;
  if (error) return <div className="py-16 text-center text-red-600">{error}</div>;
  if (items.length === 0) {
    return (
      <div className="space-y-6 py-10 text-center">
        <div>
          <h1 className="text-3xl font-black text-cvsu-dark">You are all caught up</h1>
          <p className="mt-2 text-stone-600">Complete an assessment to add more items to your review queue.</p>
        </div>
        {progress && (
          <div className="mx-auto grid max-w-2xl gap-3 text-left sm:grid-cols-4">
            {[
              ["Due now", progress.srs.due_reviews],
              ["Reviewed", progress.srs.reviewed_items],
              ["Retention", `${progress.srs.retention_percentage}%`],
              ["Study streak", `${progress.summary.study_streak_days} days`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold text-stone-500">{label}</p>
                <p className="mt-1 text-xl font-black text-cvsu-green">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const item = items[index];
  const handleReview = async (quality: number) => {
    setSaving(true);
    setError("");
    try {
      const updatedItem = await submitReview(item.id, quality);
      setLastScheduled(updatedItem.next_review_at);
      setRecall("");
      if (index + 1 >= items.length) await loadItems();
      else setIndex((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save review.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-cvsu-green">Spaced repetition</p>
          <h1 className="mt-2 text-3xl font-black text-cvsu-dark">Due reviews</h1>
        </div>
        <span className="rounded-full bg-cvsu-light px-3 py-1 text-sm font-bold text-cvsu-green">
          {index + 1} of {items.length}
        </span>
      </div>
      {progress && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Due now", progress.srs.due_reviews],
            ["Reviewed", progress.srs.reviewed_items],
            ["Retention", `${progress.srs.retention_percentage}%`],
            ["Study streak", `${progress.summary.study_streak_days} days`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">{label}</p>
              <p className="mt-1 text-xl font-black text-cvsu-green">{value}</p>
            </div>
          ))}
        </div>
      )}
      <article className="space-y-7 rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">{item.topic || "Study item"}</p>
          <h2 className="text-xl font-bold leading-relaxed text-cvsu-dark">{item.prompt || item.item_key}</h2>
        </div>
        <p className="text-xs text-stone-500">
          Current interval: {item.interval_days || 0} day{item.interval_days === 1 ? "" : "s"}.
          Rating this card schedules its next review automatically.
        </p>
        {lastScheduled && (
          <p className="rounded-xl bg-cvsu-light px-3 py-2 text-sm font-semibold text-cvsu-green">
            Next review: {new Date(lastScheduled).toLocaleDateString()}
          </p>
        )}
        <textarea
          value={recall}
          onChange={(event) => setRecall(event.target.value)}
          placeholder="Write what you remember before rating your recall..."
          className="min-h-28 w-full rounded-2xl border border-stone-200 p-4 text-sm outline-none focus:border-cvsu-green"
          disabled={saving}
        />
        <div>
          <p className="mb-3 text-sm font-bold text-stone-700">How well did you recall it?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {qualities.map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={saving}
                onClick={() => void handleReview(Number(value))}
                className="rounded-xl border border-stone-200 px-3 py-3 text-left transition hover:border-cvsu-green hover:bg-cvsu-light disabled:opacity-50"
              >
                <span className="mr-2 font-black text-cvsu-green">{value}</span>
                <span className="text-sm font-semibold text-stone-700">{label}</span>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      </article>
      {progress && progress.topics.length > 0 && (
        <section className="rounded-3xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-stone-600">Topic progress</h2>
          <div className="space-y-3">
            {progress.topics.slice(0, 5).map((topic) => (
              <div key={topic.topic} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate font-semibold text-cvsu-dark">{topic.topic}</span>
                <span className="shrink-0 text-stone-500">{topic.average_percentage}% · {topic.mastery}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
