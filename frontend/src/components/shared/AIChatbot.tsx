"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CvSUUser } from "@/types/quiz";
import { sendChatMessage } from "@/lib/api";
import { IconCvSU } from "@/components/icons";

interface Props {
  currentUser?: CvSUUser | null;
  activeTopic?: string;
}

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: string;
}

const DEFAULT_SUGGESTIONS = [
  "Explain Data Structures & Algorithms simply",
  "Give me a practice quiz question for my exam",
  "Best study strategies for CvSU Imus midterms",
  "How do I generate a quiz from my lecture notes?",
];

export default function AIChatbot({ currentUser, activeTopic }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-msg",
      role: "model",
      content: `Kamusta ${currentUser ? currentUser.full_name.split(" ")[0] : "there"}! I am **Hero Bot**, your AI Study & Assessment Partner at **CvSU – Imus Campus**.\n\nAsk me anything about your lessons, review difficult topics, practice with flash quiz questions, or get study tips for your exams!`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const messageSeqRef = useRef(0);
  const nextMessageId = (prefix: string) => {
    messageSeqRef.current += 1;
    return `${prefix}-${messageSeqRef.current}`;
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: nextMessageId("user"),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    const requestController = new AbortController();
    requestControllerRef.current = requestController;

    try {
      const payload = newMessages
        .filter((m) => m.id !== "welcome-msg")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      if (payload.length === 0) {
        payload.push({ role: "user", content: text });
      }

      const replyText = await sendChatMessage(
        payload,
        currentUser?.full_name,
        currentUser?.role,
        activeTopic,
        requestController.signal
      );

      const aiMsg: Message = {
        id: nextMessageId("ai"),
        role: "model",
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      const errorMessage = err instanceof Error
        ? err.message
        : "I encountered an issue connecting to the AI service. Please try again.";
      const errorMsg: Message = {
        id: nextMessageId("err"),
        role: "model",
        content: errorMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      requestControllerRef.current = null;
    }
  };

  const handleStopResponse = () => {
    requestControllerRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) => [
      ...prev,
      {
        id: nextMessageId("stopped"),
        role: "model",
        content: "Response stopped.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: nextMessageId("welcome"),
        role: "model",
        content: `Chat history cleared. How can I help you with your subjects at CvSU Imus today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const renderInlineMarkdown = (input: string) => {
    const tokenPattern =
      /(`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/[^\s)]+|\/[^\s)]*)\)|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
    const parts = input.split(tokenPattern);

    return parts.map((part, idx) => {
      if (!part) return null;
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        return (
          <code
            key={idx}
            className="rounded bg-slate-500/15 px-1 py-0.5 font-mono text-[11px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("[")) {
        const linkMatch = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)$/.exec(part);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          const isExternal = !href.startsWith("/");
          return (
            <a
              key={idx}
              href={href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className="font-semibold underline decoration-current/40 hover:decoration-current"
            >
              {label}
            </a>
          );
        }
      }
      if (part.startsWith("***") && part.endsWith("***") && part.length > 6) {
        return (
          <strong key={idx} className="font-bold italic">
            {part.slice(3, -3)}
          </strong>
        );
      }
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={idx} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={idx}>{part.slice(1, -1)}</em>;
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const renderFormattedText = (text: string) => {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    type MarkdownBlock = ReturnType<typeof renderInlineMarkdown>[number];
    const nodes: MarkdownBlock[] = [];

    const isTableSeparator = (line: string) =>
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

    const parseTableCells = (line: string) => {
      const stripped = line.trim().replace(/^\|/, "").replace(/\|$/, "");
      return stripped.split("|").map((cell) => cell.trim());
    };

    const unorderedRe = /^(\s*)[-*+]\s+(.*)$/;
    const orderedRe = /^(\s*)\d+[.)]\s+(.*)$/;
    const headingRe = /^(#{1,4})\s+(.*)$/;
    const hrRe = /^(?:---+|___+|\*\*\*+)$/;

    let i = 0;
    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      if (trimmed.startsWith("```")) {
        const codeLines: string[] = [];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        nodes.push(
          <pre
            key={`code-${i}`}
            className="my-1.5 overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100"
          >
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        continue;
      }

      const headingMatch = headingRe.exec(trimmed);
      if (headingMatch) {
        const level = headingMatch[1].length;
        nodes.push(
          <div
            key={`h-${i}`}
            className={
              level <= 2
                ? "mt-2 text-[13px] font-bold leading-snug"
                : "mt-1.5 text-xs font-bold leading-snug"
            }
          >
            {renderInlineMarkdown(headingMatch[2])}
          </div>
        );
        i += 1;
        continue;
      }

      if (hrRe.test(trimmed)) {
        nodes.push(<hr key={`hr-${i}`} className="my-2 border-current/15" />);
        i += 1;
        continue;
      }

      if (trimmed.startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
          i += 1;
        }
        nodes.push(
          <blockquote
            key={`q-${i}`}
            className="my-1.5 space-y-1 border-l-2 border-current/35 pl-2.5 italic opacity-85"
          >
            {quoteLines.map((qLine, qIdx) => (
              <p key={qIdx} className="leading-relaxed">
                {renderInlineMarkdown(qLine)}
              </p>
            ))}
          </blockquote>
        );
        continue;
      }

      if (rawLine.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const headers = parseTableCells(rawLine);
        const startIdx = i;
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
          rows.push(parseTableCells(lines[i]));
          i += 1;
        }
        nodes.push(
          <div
            key={`tbl-${startIdx}`}
            className="my-1.5 overflow-x-auto rounded-lg border border-current/20"
          >
            <table className="w-full border-collapse text-left text-[11px]">
              <thead className="bg-slate-500/10 font-bold">
                <tr>
                  {headers.map((header, hIdx) => (
                    <th key={hIdx} className="border-b border-current/20 px-2 py-1">
                      {renderInlineMarkdown(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-current/10 last:border-b-0">
                    {headers.map((_, cIdx) => (
                      <td key={cIdx} className="px-2 py-1 align-top">
                        {renderInlineMarkdown(row[cIdx] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      if (unorderedRe.test(rawLine)) {
        const listStart = i;
        const items: { indent: number; content: string }[] = [];
        while (i < lines.length) {
          const match = unorderedRe.exec(lines[i]);
          if (!match) break;
          items.push({ indent: match[1].length, content: match[2] });
          i += 1;
        }
        nodes.push(
          <ul key={`ul-${listStart}`} className="my-1 list-disc space-y-1 pl-4">
            {items.map((item, itemIdx) => (
              <li
                key={itemIdx}
                className={item.indent >= 2 ? "ml-3 leading-relaxed" : "leading-relaxed"}
              >
                {renderInlineMarkdown(item.content)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (orderedRe.test(rawLine)) {
        const listStart = i;
        const items: { indent: number; content: string }[] = [];
        while (i < lines.length) {
          const match = orderedRe.exec(lines[i]);
          if (!match) break;
          items.push({ indent: match[1].length, content: match[2] });
          i += 1;
        }
        nodes.push(
          <ol key={`ol-${listStart}`} className="my-1 list-decimal space-y-1 pl-4">
            {items.map((item, itemIdx) => (
              <li
                key={itemIdx}
                className={item.indent >= 2 ? "ml-3 leading-relaxed" : "leading-relaxed"}
              >
                {renderInlineMarkdown(item.content)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      const paraStart = i;
      const paraLines: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const curTrimmed = cur.trim();
        if (
          !curTrimmed ||
          curTrimmed.startsWith("```") ||
          headingRe.test(curTrimmed) ||
          hrRe.test(curTrimmed) ||
          curTrimmed.startsWith(">") ||
          unorderedRe.test(cur) ||
          orderedRe.test(cur) ||
          (cur.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
        ) {
          break;
        }
        paraLines.push(cur);
        i += 1;
      }
      nodes.push(
        <p key={`p-${paraStart}`} className="leading-relaxed">
          {paraLines.map((pLine, pIdx) => (
            <span key={pIdx} className={pIdx > 0 ? "block mt-0.5" : undefined}>
              {renderInlineMarkdown(pLine)}
            </span>
          ))}
        </p>
      );
    }

    return <div className="space-y-1.5">{nodes}</div>;
  };

  return (
    <div className={`fixed bottom-5 right-5 ${isOpen ? "z-50" : "z-30"}`}>
      
      {/* Floating Toggle Button */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.06, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="relative flex items-center gap-3 px-5 py-3.5 bg-cvsu-dark text-white rounded-full shadow-[0_15px_35px_-5px_rgba(9,60,41,0.4)] border border-cvsu-vibrant/40 hover:border-cvsu-vibrant transition-colors cursor-pointer group"
          aria-label="Open Hero Bot AI Study Assistant"
        >
          {/* Animated Pulsing Status Dot */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cvsu-vibrant opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cvsu-vibrant" />
          </span>

          <div className="w-6 h-6 rounded-lg bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center font-bold text-xs">
            <IconCvSU size={14} />
          </div>

          <div className="text-left hidden sm:block">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-white leading-none">Hero Bot</p>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-cvsu-vibrant text-cvsu-dark">
                CvSU Imus
              </span>
            </div>
            <p className="text-[10px] text-cvsu-vibrant font-medium mt-0.5 leading-none">AI Study & Exam Partner</p>
          </div>
        </motion.button>
      )}

      {/* Expanded Chatbot Modal Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 25 }}
            transition={{ type: "spring", stiffness: 140, damping: 18 }}
            className="w-[360px] sm:w-[420px] h-[580px] max-h-[85vh] bg-white rounded-3xl shadow-[0_30px_70px_-15px_rgba(0,0,0,0.35)] border border-slate-200/90 overflow-hidden flex flex-col text-slate-900"
          >
            {/* Header */}
            <div className="p-4 bg-cvsu-dark text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cvsu-vibrant text-cvsu-dark flex items-center justify-center font-bold shadow-xs">
                  <IconCvSU size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs sm:text-sm font-bold tracking-tight text-white">Hero Bot</h3>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-cvsu-vibrant text-cvsu-dark">
                      Imus Campus
                    </span>
                  </div>
                  <p className="text-[10px] text-white/70">
                    {currentUser
                      ? `${currentUser.full_name} (${currentUser.role?.toLowerCase() === "teacher" ? "Faculty" : "Student"})`
                      : "Cavite State University – Imus"}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 text-white/70">
                <button
                  onClick={handleClearChat}
                  title="Clear chat history"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs"
                >
                  🗑️
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  title="Minimize chat"
                  className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable Message History */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-stone-50/60 text-xs sm:text-sm">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                const isError = msg.id.startsWith("err-");
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] p-3.5 rounded-2xl leading-relaxed ${
                        isUser
                          ? "bg-cvsu-green text-white rounded-tr-xs shadow-xs"
                          : isError
                          ? "bg-red-50 text-red-950 border border-red-200 rounded-tl-xs shadow-2xs"
                          : "bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs shadow-2xs"
                      }`}
                    >
                      <div className="break-words font-normal">
                        {renderFormattedText(msg.content)}
                      </div>
                      {isError && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                              if (lastUserMsg) handleSendMessage(lastUserMsg.content);
                            }}
                            className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>↻ Retry query</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 px-1 font-mono">
                      {msg.timestamp}
                    </span>
                  </div>
                );
              })}

              {/* Typing / Loading Bubble */}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-white p-3 rounded-2xl border border-slate-200 w-fit">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cvsu-green animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cvsu-green animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cvsu-green animate-bounce" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600">Hero Bot is analyzing...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestion Chips */}
            {messages.length <= 3 && !isLoading && (
              <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar">
                {DEFAULT_SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(s)}
                    className="text-[11px] font-medium bg-stone-100 hover:bg-cvsu-light hover:text-cvsu-dark hover:border-cvsu-green border border-slate-200 px-3 py-1.5 rounded-full shrink-0 transition-colors cursor-pointer text-slate-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 bg-white border-t border-slate-200/80">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask Hero Bot a question or prompt..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-stone-100 rounded-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cvsu-green/20 focus:border-cvsu-green text-slate-900 placeholder:text-slate-400"
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStopResponse}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-600 text-white transition-colors hover:bg-cvsu-green"
                    aria-label="Stop Hero Bot response"
                    title="Stop Hero Bot response"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="1.5" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="w-9 h-9 rounded-full bg-cvsu-green hover:bg-cvsu-dark text-white disabled:opacity-40 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-xs hover:scale-105"
                    aria-label="Send Message to Hero Bot"
                  >
                    <svg className="w-4 h-4 translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                )}
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
