"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { StudentQuestion, QuizType, AnswerDetail } from "@/types/quiz";
import { fetchQuizAnswers, gradeAnswer } from "@/lib/api";
import { IconArrowRight } from "@/components/icons";

interface Props {
  quizId: string;
  questions: StudentQuestion[];
  quizType: QuizType;
  onComplete: (score: number, answers: AnswerDetail[]) => void;
}

export default function QuizPlayer({ quizId, questions, quizType, onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [answerDetails, setAnswerDetails] = useState<AnswerDetail[]>([]);
  const hasCompletedRef = useRef(false);
  const cachedAnswersRef = useRef<Record<number, string>>({});

  const question = questions[currentIndex];
  const itemQuizType = question?.quiz_type || quizType;
  const isTextInput = itemQuizType === "Identification" || itemQuizType === "Open Ended";
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;

  // Pre-load answers once at quiz start to prevent 10x network requests during test
  useEffect(() => {
    fetchQuizAnswers(quizId)
      .then((data) => {
        const map: Record<number, string> = {};
        data.questions.forEach((q, idx) => {
          map[idx] = q.answer;
        });
        cachedAnswersRef.current = map;
      })
      .catch(() => {
        // Fallback gracefully if answers endpoint isn't ready
      });
  }, [quizId]);

  const advanceQuestion = useCallback(() => {
    setTextInput("");
  }, []);

  const processAnswer = useCallback(
    async (userAnswer: string) => {
      if (isGrading || hasCompletedRef.current) return;
      const cleanAnswer = userAnswer.trim();
      if (!cleanAnswer) return;

      setIsGrading(true);

      try {
        let correctAnswer = cachedAnswersRef.current[currentIndex] || "";
        if (!correctAnswer) {
          const answersData = await fetchQuizAnswers(quizId);
          correctAnswer = answersData.questions[currentIndex]?.answer || "";
          cachedAnswersRef.current[currentIndex] = correctAnswer;
        }

        let isCorrect = false;
        let feedback = "";

        if (itemQuizType === "Multiple Choice" || itemQuizType === "True or False") {
          isCorrect = cleanAnswer.toLowerCase() === correctAnswer.trim().toLowerCase();
          feedback = isCorrect ? "Correct choice verified." : `Correct answer: ${correctAnswer}`;
        } else {
          try {
            const result = await gradeAnswer(question.question, correctAnswer, cleanAnswer, itemQuizType);
            isCorrect = result.is_correct;
            feedback = result.feedback;
          } catch {
            // Local fallback if AI service is temporarily slow
            isCorrect = cleanAnswer.toLowerCase() === correctAnswer.trim().toLowerCase();
            feedback = isCorrect ? "Correct answer verified." : `Evaluated. Correct: ${correctAnswer}`;
          }
        }

        const newScore = isCorrect ? score + 1 : score;
        if (isCorrect) setScore(newScore);

        const detail: AnswerDetail = {
          question: question.question,
          user_answer: cleanAnswer,
          correct_answer: correctAnswer,
          is_correct: isCorrect,
          ai_feedback: feedback,
        };
        const updatedDetails = [...answerDetails, detail];
        setAnswerDetails(updatedDetails);

        // Instant smooth advance
        if (currentIndex + 1 < questions.length) {
          setCurrentIndex((prev) => prev + 1);
          advanceQuestion();
        } else {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete(newScore, updatedDetails);
          }
        }
      } catch (err) {
        // Safe fallback: record submission without dropping data
        const fallbackDetail: AnswerDetail = {
          question: question.question,
          user_answer: cleanAnswer,
          correct_answer: cachedAnswersRef.current[currentIndex] || "",
          is_correct: false,
          ai_feedback: "Answer recorded.",
        };
        const updatedDetails = [...answerDetails, fallbackDetail];
        setAnswerDetails(updatedDetails);

        if (currentIndex + 1 < questions.length) {
          setCurrentIndex((prev) => prev + 1);
          advanceQuestion();
        } else {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete(score, updatedDetails);
          }
        }
      } finally {
        setIsGrading(false);
      }
    },
    [isGrading, quizId, currentIndex, quizType, question, score, answerDetails, questions.length, onComplete, advanceQuestion]
  );

  // Keyboard shortcut listener for Multiple Choice / True or False (Keys 1-4 or A-D)
  useEffect(() => {
    if (isTextInput || isGrading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcut trigger if user is typing in Hero Bot or any other text field
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || (activeEl as HTMLElement).isContentEditable)) {
        return;
      }

      const key = e.key.toUpperCase();
      let selectedIdx = -1;

      if (key >= "A" && key <= "D") {
        selectedIdx = key.charCodeAt(0) - 65;
      } else if (key >= "1" && key <= "4") {
        selectedIdx = parseInt(key, 10) - 1;
      }

      if (selectedIdx >= 0 && selectedIdx < question.options.length) {
        processAnswer(question.options[selectedIdx]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTextInput, isGrading, question.options, processAnswer]);

  return (
    <div className="view-transition space-y-9">
      {/* Header & Linear Progress */}
      <div className="space-y-3.5 pb-5 border-b border-stone-200">
        <div className="flex justify-between items-center text-sm font-semibold text-stone-600">
          <div className="flex items-center gap-2.5">
            <span>Question {currentIndex + 1} of {questions.length}</span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-cvsu-light text-cvsu-green border border-cvsu-green/30 font-medium">
              {question.section_name || itemQuizType}
            </span>
          </div>
          <span className="text-xs font-medium text-stone-500">
            {Math.round(progressPercent)}% done
          </span>
        </div>
        
        {/* Animated Linear Progress Bar */}
        <div className="w-full bg-stone-200 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-cvsu-green h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Dynamic Animated Question Slide Container */}
      <div key={currentIndex} className="question-transition space-y-6">
        
        {/* Question Prompt */}
        <div className="py-2">
          {question.section_name && (
            <p className="text-xs font-bold uppercase tracking-wider text-cvsu-green mb-1">
              {question.section_name}
            </p>
          )}
          <h2 className="text-xl sm:text-2xl font-semibold text-[#1C1C1C] leading-relaxed tracking-tight max-w-3xl">
            {question.question}
          </h2>
        </div>

        {/* Multiple Choice / True or False Options */}
        {!isTextInput && (
          <div className="space-y-3">
            {question.options.map((option, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => processAnswer(option)}
                disabled={isGrading}
                className="w-full text-left p-5 rounded-xl border border-stone-200 bg-white hover:border-cvsu-green hover:bg-cvsu-light/50 text-[#1C1C1C] hover:text-cvsu-green transition-all duration-150 text-sm sm:text-base flex items-center justify-between gap-4 shadow-xs hover:shadow-md group btn-tactile disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <span className="w-8 h-8 rounded-md font-semibold text-sm flex items-center justify-center shrink-0 bg-[#F7F7F2] group-hover:bg-cvsu-green group-hover:text-white text-stone-700 transition-colors border border-stone-200 group-hover:border-cvsu-green">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="font-medium group-hover:font-semibold transition-all">{option}</span>
                </div>

                <div className="w-7 h-7 rounded-xl flex items-center justify-center text-stone-300 group-hover:text-cvsu-green transition-colors">
                  <IconArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-150" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Direct Input (Identification / Open Ended) */}
        {isTextInput && (
          <div className="space-y-4">
            {itemQuizType === "Open Ended" ? (
              <textarea
                placeholder="Provide a comprehensive academic explanation based on course concepts..."
                className="w-full p-5 bg-white border border-stone-300 rounded-2xl text-sm text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green min-h-[150px] resize-y shadow-xs leading-relaxed"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={isGrading}
                autoFocus
              />
            ) : (
              <input
                type="text"
                placeholder="Type your answer term..."
                className="w-full px-5 py-4 bg-white border border-stone-300 rounded-2xl text-sm text-[#1C1C1C] placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-cvsu-green/10 focus:border-cvsu-green shadow-xs"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={isGrading}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && textInput.trim()) processAnswer(textInput.trim());
                }}
              />
            )}

            <button
              type="button"
              onClick={() => textInput.trim() && processAnswer(textInput.trim())}
              disabled={!textInput.trim() || isGrading}
              className="w-full bg-cvsu-green hover:bg-cvsu-dark text-white font-extrabold py-4 px-8 rounded-full text-sm sm:text-base transition-all shadow-lg hover:shadow-xl btn-tactile hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer border border-cvsu-vibrant/30"
            >
              {isGrading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Evaluating Response...</span>
                </>
              ) : (
                <>
                  <span>Submit & Next Question</span>
                  <IconArrowRight size={16} className="text-cvsu-vibrant" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Keyboard Hint Footer */}
        {!isTextInput && (
          <div className="pt-2 flex justify-between items-center text-[11px] text-stone-400 font-medium">
            <span>Tip: Press <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">A</kbd> - <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">D</kbd> or <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">1</kbd> - <kbd className="px-2 py-0.5 bg-[#F7F7F2] border border-stone-200 rounded-md font-mono text-stone-700">4</kbd></span>
            <span className="text-cvsu-green font-bold font-mono">Instant Fast Advance</span>
          </div>
        )}
      </div>
    </div>
  );
}
