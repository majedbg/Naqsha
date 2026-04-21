import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { generatePattern, CREDIT_COST_NEW, CREDIT_COST_REVISION } from '../lib/aiPatternService';

const STARTING_CREDITS = 24; // matches supabase/003_free_ai_allowance.sql default

/**
 * AI Pattern Chat modal.
 * mode: 'create' (new pattern) or 'revise' (modify existing)
 * onPatternGenerated(patternId, defaultParams) called on success
 */
export default function AIPatternChat({ mode: initialMode, existingSource, existingName, onPatternGenerated, onClose }) {
  const { profile } = useAuth();
  const [mode, setMode] = useState(initialMode || 'create');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [_Error, setError] = useState(null);
  const [credits, setCredits] = useState(profile?.ai_credits ?? 0);
  const scrollRef = useRef(null);

  const cost = mode === 'revise' ? CREDIT_COST_REVISION : CREDIT_COST_NEW;
  const canGenerate = credits >= cost;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput('');
    setError(null);

    const userMsg = { role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const chatHistory = messages.map((m) => ({ role: m.role, content: m.content }));
      const result = await generatePattern(prompt, {
        mode,
        existingSource: mode === 'revise' ? existingSource : undefined,
        existingName: mode === 'revise' ? existingName : undefined,
        chatHistory,
      });

      setCredits(result.creditsRemaining);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Pattern "${result.name}" generated successfully! It's now available in your pattern selector.`,
          patternId: result.patternId,
        },
      ]);

      if (onPatternGenerated) {
        onPatternGenerated(result.patternId, result.defaultParams);
      }
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, isError: true },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="bg-panel border border-card-border rounded-lg w-full max-w-[560px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-ink">AI Pattern Generator</h2>
            {/* Mode indicator */}
            <div className="flex rounded overflow-hidden border border-hairline">
              <button
                onClick={() => setMode('create')}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  mode === 'create'
                    ? 'bg-accent text-ink'
                    : 'bg-muted text-ink-soft hover:text-ink'
                }`}
              >
                + New
              </button>
              <button
                onClick={() => setMode('revise')}
                disabled={!existingSource}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  mode === 'revise'
                    ? 'bg-tone-mild/80 text-ink'
                    : 'bg-muted text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
              >
                Revise
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink transition-colors text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Mode banner */}
        <div className={`px-4 py-1.5 text-[11px] font-medium border-b border-hairline ${
          mode === 'create'
            ? 'bg-accent/10 text-accent'
            : 'bg-tone-mild/10 text-tone-mild'
        }`}>
          {mode === 'create' ? (
            <>Creating new pattern — {CREDIT_COST_NEW} credits per generation</>
          ) : (
            <>Revising "{existingName || 'pattern'}" — {CREDIT_COST_REVISION} credits per revision</>
          )}
        </div>

        {/* Credits bar */}
        <div className="px-4 py-1.5 flex items-center justify-between border-b border-hairline bg-paper-warm">
          <span className="text-[10px] text-ink-soft">
            AI credits:{' '}
            <span className={`font-medium ${credits >= cost ? 'text-accent' : 'text-tone-strong'}`}>
              {credits}
            </span>
            <span className="text-ink-soft"> / {STARTING_CREDITS}</span>
          </span>
          <span className="text-[9px] text-ink-soft">
            One allowance per account
          </span>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-ink-soft">
                {mode === 'create'
                  ? 'Describe the generative pattern you want to create.'
                  : `Describe how you'd like to modify "${existingName}".`}
              </p>
              <p className="text-[10px] text-ink">
                Examples: "concentric circles with varying radii", "a maze pattern with dead ends", "organic branching like coral"
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent/20 text-ink'
                    : msg.isError
                    ? 'bg-tone-strong/10 text-tone-strong border border-tone-strong/20'
                    : 'bg-paper-warm text-ink'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-paper-warm px-3 py-2 rounded-lg text-xs text-ink-soft">
                Generating pattern...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-hairline p-3">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-muted text-ink text-sm px-3 py-2 rounded border border-hairline outline-none focus:border-violet"
              placeholder={mode === 'create' ? 'Describe your pattern...' : 'Describe the revision...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={loading || !canGenerate}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim() || !canGenerate}
              className="px-4 py-2 text-sm font-medium rounded bg-accent text-ink hover:bg-saffron-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '...' : 'Generate'}
            </button>
          </div>
          {!canGenerate && (
            <p className="text-[10px] text-ink-soft mt-1">
              You&apos;ve used your AI allowance for this account. New patterns and
              revisions are disabled.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
