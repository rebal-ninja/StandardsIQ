import React, { useState, useRef, useEffect } from 'react';
import { askInsights } from '../services/api';
import './AIInsights.css';

const SUGGESTED_QUESTIONS = [
  'Why was this recommended?',
  'Summarize these standards',
  'Compare the recommendations',
  'What does this standard cover?',
];

/**
 * AIInsights — compact Q&A panel for the Recommendations page.
 *
 * Props:
 *   productDescription  {string}  — the original procurement spec
 *   recommendations     {Array}   — enriched recommendation objects from the page state
 */
function AIInsights({ productDescription, recommendations }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const bottomRef = useRef(null);

  // Scroll to the latest message whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || loading) return;

    const userMsg = { role: 'user', text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const answer = await askInsights(q, productDescription, recommendations);
      setMessages((prev) => [...prev, { role: 'ai', text: answer }]);
    } catch (err) {
      // Distinguish network / 503 (service down) from a normal LLM error
      const status = err?.response?.status;
      if (!err.response || status === 503 || status === 0) {
        setUnavailable(true);
      } else {
        const detail =
          err?.response?.data?.detail || err.message || 'Something went wrong.';
        setMessages((prev) => [
          ...prev,
          { role: 'error', text: `Could not get an answer: ${detail}` },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    ask(input);
  };

  if (unavailable) {
    return (
      <div className="ai-insights ai-insights--unavailable" role="complementary" aria-label="AI Insights">
        <div className="ai-insights__header">
          <span className="ai-insights__icon" aria-hidden="true">✦</span>
          <span className="ai-insights__title">AI Insights</span>
        </div>
        <p className="ai-insights__unavailable-msg">
          AI Insights is temporarily unavailable.
        </p>
      </div>
    );
  }

  return (
    <section className="ai-insights" role="complementary" aria-label="AI Insights">
      {/* Header */}
      <div className="ai-insights__header">
        <span className="ai-insights__icon" aria-hidden="true">✦</span>
        <div>
          <span className="ai-insights__title">AI Insights</span>
          <span className="ai-insights__subtitle">
            Ask questions about the recommended standards
          </span>
        </div>
      </div>

      {/* Suggested questions — shown only before first message */}
      {messages.length === 0 && !loading && (
        <div className="ai-insights__suggestions" role="list">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              className="ai-insights__suggestion"
              onClick={() => ask(q)}
              role="listitem"
              type="button"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      {messages.length > 0 && (
        <div className="ai-insights__thread" aria-live="polite" aria-label="Conversation">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`ai-insights__msg ai-insights__msg--${msg.role}`}
            >
              {msg.role === 'user' && (
                <span className="ai-insights__msg-label">You</span>
              )}
              {msg.role === 'ai' && (
                <span className="ai-insights__msg-label ai-insights__msg-label--ai">
                  AI
                </span>
              )}
              <p className="ai-insights__msg-text">{msg.text}</p>
            </div>
          ))}

          {/* Loading bubble */}
          {loading && (
            <div className="ai-insights__msg ai-insights__msg--ai ai-insights__msg--loading">
              <span className="ai-insights__msg-label ai-insights__msg-label--ai">AI</span>
              <span className="ai-insights__dots" aria-label="Thinking">
                <span /><span /><span />
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Loading spinner shown before first reply (no thread yet) */}
      {messages.length === 0 && loading && (
        <div className="ai-insights__thinking" aria-live="polite">
          <span className="ai-insights__dots" aria-label="Thinking">
            <span /><span /><span />
          </span>
        </div>
      )}

      {/* Input row */}
      <form className="ai-insights__input-row" onSubmit={handleSubmit}>
        <input
          className="ai-insights__input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about these standards…"
          disabled={loading}
          aria-label="Ask a question about the recommended standards"
          maxLength={500}
        />
        <button
          className="ai-insights__send"
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send question"
        >
          {loading ? (
            <span className="ai-insights__send-spinner" aria-hidden="true" />
          ) : (
            '→'
          )}
        </button>
      </form>

      <p className="ai-insights__disclaimer">
        AI-assisted discovery only. Verify against official BIS documentation before procurement.
      </p>
    </section>
  );
}

export default AIInsights;
