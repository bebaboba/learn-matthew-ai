import { useState, useRef, useEffect } from 'react';

const OPENING = {
  recruiter: "Hi — I can give you a quick, honest picture of Matthew's background, what he's built, and what he's looking for next. What would be most useful to know?",
  hiring_manager: "Hello. I can walk you through Matthew's work in detail — specific projects, what he shipped, how he approaches things. What are you trying to understand?",
  curious_stranger: "Hey, welcome. I can tell you pretty much anything about Matthew — the work, the SF life, the random art world chapter, all of it. What are you curious about?",
};

const PERSONA_LABEL = {
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring Manager',
  curious_stranger: 'Curious Stranger',
};

const SID_KEY = 'lm_sid';

function sessionId() {
  try {
    let s = localStorage.getItem(SID_KEY);
    if (!s) {
      s = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2);
      localStorage.setItem(SID_KEY, s);
    }
    return s;
  } catch {
    return 'anon';
  }
}

export default function Chat({ persona, onBack }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: OPENING[persona] },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsStreaming(true);

    // Add empty assistant message that we'll stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          persona,
          sessionId: sessionId(),
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + parsed.text };
                return updated;
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong. Try again.' };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-wrapper">
      <header className="chat-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <span className="chat-title">Learn Matthew</span>
        <span className="persona-badge">{PERSONA_LABEL[persona]}</span>
      </header>

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message message--${m.role}`}>
            {m.role === 'assistant' && <span className="message-sender">Matthew</span>}
            <div className="message-bubble">
              {m.content}
              {isStreaming && i === messages.length - 1 && m.role === 'assistant' && (
                <span className="cursor" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything…"
          rows={1}
          disabled={isStreaming}
        />
        <button
          className="send-btn"
          onClick={send}
          disabled={!input.trim() || isStreaming}
        >
          Send
        </button>
      </div>
    </div>
  );
}
