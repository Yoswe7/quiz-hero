"use client";

import { Question } from "@/types/quiz";

interface Props {
  topic: string;
  questions: Question[];
  quizType: string;
}

export default function TeacherQuizPreview({ topic, questions, quizType }: Props) {
  return (
    <div className="space-y-6 print:space-y-0">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div>
          <p className="text-sm font-semibold text-cvsu-green">Teacher preview</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1C1C1C]">{topic}</h2>
          <p className="mt-1 text-sm text-stone-600">
            {questions.length} questions · {quizType}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-xs transition-colors hover:border-cvsu-green hover:text-cvsu-green"
        >
          Print test paper
        </button>
      </div>

      <article className="bg-white px-1 py-2 text-[#1C1C1C] sm:px-8 sm:py-6 print:px-0 print:py-0">
        <header className="border-b-2 border-[#1C1C1C] pb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Cavite State University - Imus Campus</p>
          <h1 className="mt-2 text-xl font-bold uppercase tracking-wide">{topic}</h1>
          <p className="mt-1 text-sm text-stone-600">{quizType} Assessment</p>
          <div className="mt-6 grid grid-cols-2 gap-6 text-left text-sm sm:grid-cols-3">
            <span>Name: ______________________________</span>
            <span>Section: __________________</span>
            <span className="col-span-2 sm:col-span-1">Date: __________________</span>
          </div>
        </header>

        <section className="mt-7 space-y-7">
          {questions.map((question, index) => (
            <div key={`${question.question}-${index}`} className="break-inside-avoid space-y-3">
              <p className="text-base font-semibold leading-relaxed">
                {index + 1}. {question.question}
              </p>

              {question.options.length > 0 ? (
                <div className="grid gap-2 pl-5 text-sm sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <p key={option}>
                      {String.fromCharCode(65 + optionIndex)}. {option}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 pl-5 text-sm text-stone-500">
                  <p>Answer: ____________________________________________________</p>
                  {question.quiz_type === "Open Ended" && <p>________________________________________________________________</p>}
                </div>
              )}
            </div>
          ))}
        </section>
      </article>

      <section className="break-before-page border-t-2 border-stone-300 pt-7 print:mt-12">
        <div className="mb-5">
          <p className="text-sm font-semibold text-cvsu-green">Teacher-only reference</p>
          <h2 className="mt-1 text-xl font-bold text-[#1C1C1C]">Answer key</h2>
        </div>
        <ol className="grid gap-3 text-sm sm:grid-cols-2">
          {questions.map((question, index) => (
            <li key={`answer-${question.question}-${index}`} className="break-inside-avoid rounded-lg border border-stone-200 px-3 py-2">
              <span className="font-semibold">{index + 1}.</span> {question.answer}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}