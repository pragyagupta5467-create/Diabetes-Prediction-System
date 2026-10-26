import { useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://diabetes-prediction-system-1-qvw0.onrender.com";

const SUGGESTED_QUESTIONS = [
  "What does my prediction mean?",
  "What lifestyle habits can help reduce my risk?",
  "What foods should I consider?",
  "What exercise is suitable for beginners?",
  "What should I discuss with my doctor?",
];

function createWelcomeMessage(hasPrediction) {
  return {
    role: "assistant",
    content: hasPrediction
      ? "I can explain your model result and answer general questions about diabetes. This estimate is educational information, not a diagnosis or a substitute for advice from a healthcare professional."
      : "Hello! Ask me general questions about diabetes, healthy habits, or preparing for a conversation with your healthcare professional. I can provide educational information, but I cannot diagnose or replace medical care.",
  };
}

function HealthAssistant({ predictionToken, predictionTimestamp, hasPrediction, darkMode }) {
  const [messages, setMessages] = useState(() => [
    createWelcomeMessage(hasPrediction),
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retryMessage, setRetryMessage] = useState("");
  const endOfMessagesRef = useRef(null);
  const sessionKey = predictionTimestamp || (hasPrediction ? "prediction-without-context" : "general");

  useEffect(() => {
    setMessages([createWelcomeMessage(hasPrediction)]);
    setError("");
    setRetryMessage("");
    setDraft("");
  }, [sessionKey, hasPrediction]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const sendMessage = async (value, isRetry = false) => {
    const message = value.trim();
    if (!message || sending) return;

    const previousMessages = isRetry ? messages.slice(0, -1) : messages;
    if (!isRetry) {
      setMessages((current) => [
        ...current.slice(-11),
        { role: "user", content: message },
      ]);
    }
    setDraft("");
    setError("");
    setRetryMessage("");
    setSending(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: previousMessages
            .filter((item) => item.role === "user" || item.role === "assistant")
            .slice(-10)
            .map(({ role, content }) => ({ role, content })),
          ...(predictionToken ? { prediction_context: predictionToken } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error?.message || "The assistant could not respond. Please try again.");
      }
      if (typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error("The assistant returned an empty response. Please retry.");
      }

      setMessages((current) => [
        ...current.slice(-11),
        { role: "assistant", content: data.reply },
      ]);
    } catch (requestError) {
      setError(requestError.message || "Unable to contact the AI assistant.");
      setRetryMessage(message);
    } finally {
      setSending(false);
    }
  };

  const startNewConversation = () => {
    setMessages([createWelcomeMessage(hasPrediction)]);
    setDraft("");
    setError("");
    setRetryMessage("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter"
      && !event.shiftKey
      && !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendMessage(draft);
    }
  };

  const cardClass = darkMode
    ? "bg-gray-800/50 border border-gray-700/50 text-white"
    : "bg-white/80 border border-gray-200 text-gray-900";
  const secondaryTextClass = darkMode ? "text-gray-400" : "text-gray-600";

  return (
    <section
      aria-labelledby="health-assistant-heading"
      className={`rounded-3xl p-5 sm:p-8 shadow-2xl ${cardClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="health-assistant-heading" className="text-2xl font-bold">
            AI Diabetes Health Assistant
          </h2>
          <p className={`mt-2 max-w-2xl text-sm ${secondaryTextClass}`}>
            Ask for general, educational information about diabetes and healthy habits.
            This assistant does not diagnose or replace a healthcare professional.
          </p>
        </div>
        <button
          type="button"
          onClick={startNewConversation}
          disabled={sending}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            darkMode
              ? "bg-gray-700 text-white hover:bg-gray-600"
              : "bg-gray-100 text-gray-800 hover:bg-gray-200"
          }`}
        >
          New conversation
        </button>
      </div>

      {hasPrediction && !predictionToken && (
        <p
          role="status"
          className={`mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm ${
            darkMode ? "text-amber-200" : "text-amber-800"
          }`}
        >
          Prediction context is unavailable for this result. You can still ask general
          educational questions.
        </p>
      )}

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className={`mt-6 flex max-h-[28rem] min-h-64 flex-col gap-4 overflow-y-auto rounded-2xl p-4 ${
          darkMode ? "bg-gray-950/50" : "bg-gray-50"
        }`}
      >
        {messages.map((item, index) => {
          const isUser = item.role === "user";
          return (
            <div
              key={`${index}-${item.role}`}
              className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${
                isUser
                  ? "self-end bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                  : darkMode
                    ? "self-start border border-gray-700 bg-gray-800 text-gray-100"
                    : "self-start border border-gray-200 bg-white text-gray-800"
              }`}
            >
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide opacity-70">
                {isUser ? "You" : "Assistant"}
              </span>
              {item.content}
            </div>
          );
        })}
        {sending && (
          <div
            role="status"
            className={`self-start rounded-2xl px-4 py-3 text-sm ${
              darkMode ? "bg-gray-800 text-gray-300" : "bg-white text-gray-700"
            }`}
          >
            Assistant is thinking…
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {messages.length === 1 && !sending && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              type="button"
              key={question}
              onClick={() => void sendMessage(question)}
              className={`rounded-full border px-3 py-2 text-left text-xs transition-colors ${
                darkMode
                  ? "border-gray-700 text-gray-300 hover:border-purple-500 hover:text-white"
                  : "border-gray-200 text-gray-700 hover:border-purple-400 hover:text-purple-800"
              }`}
            >
              {question}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          <span>{error}</span>
          {retryMessage && (
            <button
              type="button"
              onClick={() => void sendMessage(retryMessage, true)}
              disabled={sending}
              className="rounded-lg bg-red-500/10 px-3 py-2 font-semibold hover:bg-red-500/20 disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-3">
        <label className="sr-only" htmlFor="health-assistant-message">
          Your message
        </label>
        <textarea
          id="health-assistant-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          rows={2}
          placeholder="Ask a general health question…"
          disabled={sending}
          className={`min-h-12 flex-1 resize-y rounded-xl border px-4 py-3 text-sm outline-none focus:border-purple-500 disabled:opacity-60 ${
            darkMode
              ? "border-gray-700 bg-gray-900 text-white placeholder-gray-500"
              : "border-gray-200 bg-white text-gray-900 placeholder-gray-400"
          }`}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-5 font-bold text-white transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      <p className={`mt-2 text-xs ${secondaryTextClass}`}>
        Enter sends; Shift+Enter starts a new line. Conversation history is kept only
        in this page session.
      </p>
    </section>
  );
}

export default HealthAssistant;
