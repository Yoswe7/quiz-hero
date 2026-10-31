"use client";

import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Question, QuizType } from "@/types/quiz";
import { fetchQuizAnswers, updateQuiz } from "@/lib/api";
import { IconTrash, IconPlus, IconCheckCircle, IconEdit } from "@/components/icons";

interface Props {
  quizId: string;
  initialTopic: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AssessmentEditorModal({
  quizId,
  initialTopic,
  onClose,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState(initialTopic);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load full quiz details with answer keys
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setIsLoading(true);
      setError("");
      try {
        const data = await fetchQuizAnswers(quizId);
        if (mounted) {
          if (data.topic) setTopic(data.topic);
          setQuestions(
            data.questions.map((q) => ({
              ...q,
              options: Array.isArray(q.options) ? [...q.options] : [],
              quiz_type: q.quiz_type || "Multiple Choice",
            }))
          );
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load assessment data.");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [quizId]);

  // Handlers for question mutations
  const handleUpdateQuestionText = (index: number, text: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], question: text };
      return next;
    });
  };

  const handleUpdateQuestionType = (index: number, type: QuizType) => {
    setQuestions((prev) => {
      const next = [...prev];
      const current = next[index];
      let newOptions = current.options;
      let newAnswer = current.answer;

      if (type === "True or False") {
        newOptions = ["True", "False"];
        if (newAnswer !== "True" && newAnswer !== "False") {
          newAnswer = "True";
        }
      } else if (type === "Multiple Choice" && newOptions.length < 2) {
        newOptions = ["Option A", "Option B", "Option C", "Option D"];
        newAnswer = newOptions[0];
      } else if (type === "Identification" || type === "Open Ended") {
        newOptions = [];
      }

      next[index] = {
        ...current,
        quiz_type: type,
        options: newOptions,
        answer: newAnswer,
      };
      return next;
    });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, text: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = next[qIndex];
      const oldOptText = q.options[optIndex];
      const updatedOpts = [...q.options];
      updatedOpts[optIndex] = text;

      // If the edited option was the current correct answer, update the answer reference too
      let updatedAnswer = q.answer;
      if (q.answer === oldOptText) {
        updatedAnswer = text;
      }

      next[qIndex] = { ...q, options: updatedOpts, answer: updatedAnswer };
      return next;
    });
  };

  const handleSetCorrectAnswer = (qIndex: number, answerText: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      next[qIndex] = { ...next[qIndex], answer: answerText };
      return next;
    });
  };

  const handleAddOption = (qIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = next[qIndex];
      const newOptionName = `Option ${String.fromCharCode(65 + q.options.length)}`;
      next[qIndex] = {
        ...q,
        options: [...q.options, newOptionName],
      };
      return next;
    });
  };

  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = next[qIndex];
      const removedText = q.options[optIndex];
      const updatedOpts = q.options.filter((_, i) => i !== optIndex);
      let updatedAnswer = q.answer;
      if (updatedAnswer === removedText && updatedOpts.length > 0) {
        updatedAnswer = updatedOpts[0];
      }
      next[qIndex] = { ...q, options: updatedOpts, answer: updatedAnswer };
      return next;
    });
  };

  const handleDeleteQuestion = (qIndex: number) => {
    if (questions.length <= 1) {
      setError("An assessment must contain at least 1 question.");
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
    setError("");
  };

  const handleAddNewQuestion = () => {
    const newQ: Question = {
      question: "New question prompt here...",
      quiz_type: "Multiple Choice",
      options: ["Option A", "Option B", "Option C", "Option D"],
      answer: "Option A",
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const handleSave = async () => {
    if (!topic.trim()) {
      setError("Assessment topic title cannot be empty.");
      return;
    }

    if (questions.length === 0) {
      setError("Assessment must contain at least 1 question.");
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        setError(`Question #${i + 1} prompt cannot be empty.`);
        return;
      }
      if (!q.answer.trim()) {
        setError(`Question #${i + 1} must have a designated correct answer.`);
        return;
      }
      if (q.quiz_type === "Multiple Choice" && q.options.length < 2) {
        setError(`Question #${i + 1} must have at least 2 options.`);
        return;
      }
    }

    setIsSaving(true);
    setError("");

    try {
      await updateQuiz(quizId, {
        topic: topic.trim(),
        questions,
      });

      // Instantly invalidate TanStack Query caches so previews and student views reflect changes immediately
      await queryClient.invalidateQueries({ queryKey: ["quiz", quizId] });
      await queryClient.invalidateQueries({ queryKey: ["quiz-answers", quizId] });
      await queryClient.invalidateQueries({ queryKey: ["quizzes"] });

      setSuccess("Assessment changes saved successfully!");
      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update assessment.");
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-hidden">
      {/* Modal Surface */}
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden text-slate-900 animate-in fade-in zoom-in-95 duration-200">
        {/* Institutional Academic Green Banner */}
        <div className="h-2.5 bg-gradient-to-r from-cvsu-green via-cvsu-dark to-cvsu-vibrant shrink-0" />

        {/* Modal Header */}
        <div className="px-6 py-4 bg-cvsu-dark text-white flex items-center justify-between gap-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center shrink-0 shadow-sm font-bold">
              <IconEdit size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2 truncate">
                <span>Edit Assessment</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cvsu-vibrant text-cvsu-dark">
                  Faculty Studio
                </span>
              </h2>
              <p className="text-xs text-white/70 truncate">
                Update topic curriculum, questions, options, and answer keys
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#F7F7F2]/60">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <div className="w-9 h-9 border-3 border-cvsu-green/20 border-t-cvsu-green rounded-full animate-spin" />
              <p className="text-xs font-semibold text-stone-600">
                Loading assessment details and curriculum questions...
              </p>
            </div>
          ) : (
            <>
              {/* Feedback Banners */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-semibold flex items-start gap-2.5 shadow-xs">
                  <span className="text-base leading-none">⚠️</span>
                  <div className="flex-1">
                    <p className="font-bold">Cannot Save Assessment</p>
                    <p className="mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              {success && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2.5 shadow-xs">
                  <IconCheckCircle size={18} className="text-cvsu-green shrink-0" />
                  <p>{success}</p>
                </div>
              )}

              {/* Assessment Topic Input */}
              <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-cvsu-dark block">
                  Assessment Topic / Title
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Philippine History, Object Oriented Programming"
                  className="w-full px-4 py-2.5 text-sm font-semibold text-[#1C1C1C] bg-[#F7F7F2] border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cvsu-green focus:bg-white transition-all"
                />
              </div>

              {/* Questions Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-cvsu-dark">
                      Curriculum Questions ({questions.length})
                    </h3>
                    <p className="text-xs text-stone-500">
                      Configure question prompts, choices, and verified answer keys.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddNewQuestion}
                    className="px-3.5 py-1.5 bg-cvsu-green hover:bg-cvsu-dark text-white text-xs font-bold rounded-full transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <IconPlus size={14} />
                    <span>Add Question</span>
                  </button>
                </div>

                {/* Question Cards */}
                <div className="space-y-4">
                  {questions.map((q, qIdx) => {
                    const isMC = q.quiz_type === "Multiple Choice";
                    const isTF = q.quiz_type === "True or False";
                    const isIdent = q.quiz_type === "Identification";
                    const isOpen = q.quiz_type === "Open Ended";

                    return (
                      <div
                        key={qIdx}
                        className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-4 transition-all hover:border-stone-300"
                      >
                        {/* Question Card Header */}
                        <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-cvsu-green text-white font-extrabold text-xs flex items-center justify-center">
                              {qIdx + 1}
                            </span>
                            <span className="text-xs font-bold text-stone-700">Question #{qIdx + 1}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Format Selector Dropdown */}
                            <select
                              value={q.quiz_type || "Multiple Choice"}
                              onChange={(e) =>
                                handleUpdateQuestionType(qIdx, e.target.value as QuizType)
                              }
                              className="text-xs font-semibold px-2.5 py-1 bg-stone-100 border border-stone-200 rounded-lg text-stone-700 focus:outline-none focus:ring-1 focus:ring-cvsu-green cursor-pointer"
                            >
                              <option value="Multiple Choice">Multiple Choice</option>
                              <option value="True or False">True or False</option>
                              <option value="Identification">Identification</option>
                              <option value="Open Ended">Open Ended</option>
                            </select>

                            {/* Delete Question */}
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(qIdx)}
                              className="w-7 h-7 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete Question"
                            >
                              <IconTrash size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Question Prompt */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                            Question Prompt
                          </label>
                          <textarea
                            rows={2}
                            value={q.question}
                            onChange={(e) => handleUpdateQuestionText(qIdx, e.target.value)}
                            className="w-full px-3.5 py-2 text-xs font-medium text-[#1C1C1C] bg-[#F7F7F2] border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cvsu-green focus:bg-white transition-all resize-y"
                            placeholder="Enter question text..."
                          />
                        </div>

                        {/* Format: Multiple Choice */}
                        {isMC && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                                Answer Choices (Select radio button for the correct key)
                              </label>
                              <button
                                type="button"
                                onClick={() => handleAddOption(qIdx)}
                                className="text-[11px] font-bold text-cvsu-green hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <IconPlus size={12} />
                                <span>Add Choice</span>
                              </button>
                            </div>

                            <div className="space-y-2">
                              {q.options.map((opt, optIdx) => {
                                const isCorrect = q.answer === opt;
                                return (
                                  <div
                                    key={optIdx}
                                    className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                                      isCorrect
                                        ? "bg-emerald-50/70 border-emerald-300"
                                        : "bg-white border-stone-200"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`correct-ans-${qIdx}`}
                                      checked={isCorrect}
                                      onChange={() => handleSetCorrectAnswer(qIdx, opt)}
                                      className="w-4 h-4 text-cvsu-green focus:ring-cvsu-green cursor-pointer accent-[#14532d]"
                                      title="Mark as correct answer"
                                    />
                                    <input
                                      type="text"
                                      value={opt}
                                      onChange={(e) =>
                                        handleUpdateOption(qIdx, optIdx, e.target.value)
                                      }
                                      placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                      className="flex-1 px-3 py-1.5 text-xs text-stone-800 bg-transparent focus:outline-none font-medium"
                                    />
                                    {isCorrect && (
                                      <span className="text-[10px] font-extrabold text-cvsu-green uppercase tracking-wider bg-cvsu-light px-2 py-0.5 rounded-full shrink-0">
                                        Correct Key
                                      </span>
                                    )}
                                    {q.options.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveOption(qIdx, optIdx)}
                                        className="text-stone-300 hover:text-red-500 p-1 cursor-pointer"
                                        title="Remove option"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Format: True or False */}
                        {isTF && (
                          <div className="space-y-1 pt-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                              Correct Binary State
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {["True", "False"].map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => handleSetCorrectAnswer(qIdx, val)}
                                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                    q.answer.toLowerCase() === val.toLowerCase()
                                      ? "bg-cvsu-green text-white border-cvsu-green shadow-xs"
                                      : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                                  }`}
                                >
                                  {val}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Format: Identification & Open Ended */}
                        {(isIdent || isOpen) && (
                          <div className="space-y-1 pt-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                              {isIdent ? "Target Identification Term" : "Model Reference Answer / Grading Key"}
                            </label>
                            <input
                              type="text"
                              value={q.answer}
                              onChange={(e) => handleSetCorrectAnswer(qIdx, e.target.value)}
                              placeholder="Enter official answer key..."
                              className="w-full px-3.5 py-2 text-xs font-mono text-stone-800 bg-[#F7F7F2] border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cvsu-green focus:bg-white transition-all"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-white border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-full text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading || isSaving}
              className="px-6 py-2.5 bg-cvsu-green hover:bg-cvsu-dark text-white rounded-full text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <IconCheckCircle size={15} />
                  <span>Save Assessment Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

