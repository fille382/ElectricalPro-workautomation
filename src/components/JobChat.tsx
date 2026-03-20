import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useChat } from '../hooks/useIndexedDB';
import { chatWithJob, type ChatContext } from '../utils/claude';
import { searchKnowledge, learnFromChat, markUsed } from '../utils/knowledgeBase';
import { searchCatalog } from '../utils/catalog';
import { useTranslation } from '../contexts/I18nContext';
import type { Job, Task, Photo, ShoppingItem } from '../types';

interface JobChatProps {
  jobId: string;
  apiKey: string | null;
  job: Job;
  tasks: Task[];
  photos: Photo[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<any>;
  onCreateTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => Promise<any>;
  onDeleteTask: (taskId: string) => Promise<any>;
  onAddShoppingItem?: (item: Omit<ShoppingItem, 'id' | 'created_at'>) => Promise<any>;
  onUpdateShoppingItem?: (id: string, updates: Partial<ShoppingItem>) => Promise<any>;
  onDeleteShoppingItem?: (id: string) => Promise<any>;
  shoppingItems?: ShoppingItem[];
}

export default function JobChat({ jobId, apiKey, job, tasks, photos, onUpdateTask, onCreateTask, onDeleteTask, onAddShoppingItem, onUpdateShoppingItem, onDeleteShoppingItem, shoppingItems = [] }: JobChatProps) {
  const { t, language } = useTranslation();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [activeOptions, setActiveOptions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Only load chat messages from DB once the user opens the chat
  const { messages, addMessage, clearMessages } = useChat(chatLoaded ? jobId : null);

  useEffect(() => {
    if (isOpen && !chatLoaded) setChatLoaded(true);
  }, [isOpen, chatLoaded]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || sending || !apiKey) return;

    setInput('');
    setSending(true);
    setActiveOptions([]);

    try {
      await addMessage({ job_id: jobId, role: 'user', content: text });

      const context: ChatContext = {
        job: { name: job.name, description: job.description || undefined, address: job.address || undefined },
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, source_photo_id: t.source_photo_id })),
        photoSummaries: photos
          .filter((p) => p.extracted_info)
          .map((p) => ({
            id: p.id,
            component_type: p.extracted_info?.component_type,
            condition: p.extracted_info?.condition,
            recommendations: p.extracted_info?.recommendations,
          })),
        shoppingItems: shoppingItems.map((s) => ({ name: s.name, e_number: s.e_number, quantity: s.quantity, unit: s.unit, checked: s.checked })),
      };

      // Search knowledge base for relevant context
      const kbResults = await searchKnowledge(text);
      const kbContext = kbResults.length > 0
        ? kbResults.map((k) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n')
        : undefined;
      for (const entry of kbResults) markUsed(entry.id).catch(() => {});

      // Catalog search is now handled by AI via tool use — the AI decides what to search for
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await chatWithJob(text, history, context, apiKey, language, kbContext);

      // Execute any actions the AI returned
      let updated = 0, created = 0, deleted = 0, shopped = 0, shopDeleted = 0;
      for (const action of response.actions) {
        try {
          if (action.type === 'update_task' && action.task_id) {
            const updates: Partial<Task> = {};
            if (action.status) updates.status = action.status;
            if (action.title) updates.title = action.title;
            if (Object.keys(updates).length > 0) {
              await onUpdateTask(action.task_id, updates);
              updated++;
            }
          } else if (action.type === 'create_task' && action.title) {
            await onCreateTask({
              job_id: jobId,
              title: action.title,
              description: '',
              status: 'pending',
              notes: '',
              parent_task_id: action.parent_task_id,
            });
            created++;
          } else if (action.type === 'delete_task' && action.task_id) {
            await onDeleteTask(action.task_id);
            deleted++;
          } else if (action.type === 'add_shopping_item' && action.name && onAddShoppingItem) {
            // AI should provide e_number via tool use, but fallback search if missing
            let eNum = action.e_number;
            let artNum = action.article_number;
            let mfr = action.manufacturer;
            if (!eNum) {
              let matches = await searchCatalog(action.name, 3);
              if (matches.length === 0 && action.name.includes(' ')) {
                const words = action.name.split(' ').filter(w => w.length > 2).slice(0, 3);
                matches = await searchCatalog(words.join(' '), 3);
              }
              if (matches.length > 0) {
                eNum = matches[0].e;
                artNum = artNum || matches[0].a;
                mfr = mfr || matches[0].m;
                console.log(`[Shop] Enriched "${action.name}" from API: E-nr ${eNum}`);
              }
            }
            // Deduplicate: if same E-number exists, update quantity instead
            const existingItem = eNum
              ? shoppingItems.find(s => s.e_number === eNum)
              : shoppingItems.find(s => s.name.toLowerCase() === action.name!.toLowerCase());
            if (existingItem && onUpdateShoppingItem) {
              await onUpdateShoppingItem(existingItem.id, {
                quantity: existingItem.quantity + (action.quantity || 1),
              });
              console.log(`[Shop] Deduplicated "${action.name}" — updated quantity to ${existingItem.quantity + (action.quantity || 1)}`);
              shopped++;
            } else {
              await onAddShoppingItem({
                job_id: jobId,
                name: action.name,
                e_number: eNum,
                article_number: artNum,
                manufacturer: mfr,
                category: action.category,
                quantity: action.quantity || 1,
                unit: action.unit || 'st',
                checked: false,
              });
              shopped++;
            }
          } else if (action.type === 'delete_shopping_item' && action.name && onDeleteShoppingItem) {
            // Delete parent and its sub-items
            const match = shoppingItems.find((s) => s.name.toLowerCase().includes(action.name!.toLowerCase()));
            if (match) {
              const subs = shoppingItems.filter((s) => s.parent_item_id === match.id);
              for (const sub of subs) await onDeleteShoppingItem(sub.id);
              await onDeleteShoppingItem(match.id);
              shopDeleted++;
            }
          } else if (action.type === 'clear_shopping_list' && onDeleteShoppingItem) {
            for (const s of shoppingItems) { await onDeleteShoppingItem(s.id); shopDeleted++; }
          }
        } catch (err) {
          console.error('[Chat] Failed to apply action:', err);
        }
      }

      // Add action summary
      let displayMessage = response.message;
      const parts: string[] = [];
      if (created > 0) parts.push(language === 'sv' ? `${created} uppgift(er) skapad(e)` : `${created} task(s) created`);
      if (updated > 0) parts.push(language === 'sv' ? `${updated} uppgift(er) uppdaterad(e)` : `${updated} task(s) updated`);
      if (deleted > 0) parts.push(language === 'sv' ? `${deleted} uppgift(er) borttagen/borttagna` : `${deleted} task(s) deleted`);
      if (shopped > 0) parts.push(language === 'sv' ? `${shopped} artikel tillagd(a) i inköpslistan` : `${shopped} item(s) added to shopping list`);
      if (shopDeleted > 0) parts.push(language === 'sv' ? `${shopDeleted} artikel borttagen från inköpslistan` : `${shopDeleted} item(s) removed from shopping list`);
      if (parts.length > 0) {
        displayMessage += '\n\n✅ ' + parts.join(', ');
      }

      await addMessage({ job_id: jobId, role: 'assistant', content: displayMessage });

      // Store interactive options if AI provided them
      if (response.options && response.options.length > 0) {
        setActiveOptions(response.options);
      }

      // Auto-learn from AI response (fire-and-forget)
      learnFromChat(text, response.message, language).catch(() => {});
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      // Show user-friendly error messages instead of raw API errors
      let friendlyMsg: string;
      if (msg.includes('credit balance') || msg.includes('billing') || msg.includes('purchase credits')) {
        friendlyMsg = language === 'sv'
          ? '⚠️ API-krediter slut. Fyll på credits på console.anthropic.com under Billing.'
          : '⚠️ API credits depleted. Top up at console.anthropic.com under Billing.';
      } else if (msg.includes('invalid_api_key') || msg.includes('authentication')) {
        friendlyMsg = language === 'sv'
          ? '⚠️ Ogiltig API-nyckel. Kontrollera din nyckel i Inställningar.'
          : '⚠️ Invalid API key. Check your key in Settings.';
      } else if (msg.includes('rate_limit') || msg.includes('429')) {
        friendlyMsg = language === 'sv'
          ? '⚠️ För många anrop. Vänta en stund och försök igen.'
          : '⚠️ Too many requests. Wait a moment and try again.';
      } else if (msg.includes('timed out')) {
        friendlyMsg = language === 'sv'
          ? '⚠️ Anropet tog för lång tid. Försök igen.'
          : '⚠️ Request timed out. Please try again.';
      } else if (msg.includes('Too many tool call')) {
        friendlyMsg = language === 'sv'
          ? '⚠️ Sökningen tog för lång tid. Försök med en mer specifik fråga.'
          : '⚠️ Search took too long. Try a more specific question.';
      } else {
        friendlyMsg = language === 'sv'
          ? `⚠️ Något gick fel. Försök igen.`
          : `⚠️ Something went wrong. Please try again.`;
      }
      console.error('[Chat Error]', msg);
      await addMessage({ job_id: jobId, role: 'assistant', content: friendlyMsg });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (text: string) => {
    handleSend(text);
  };

  // Generate contextual quick-reply suggestions
  const suggestions = useMemo(() => {
    const sv = language === 'sv';
    const chips: string[] = [];
    const activeTasks = tasks.filter((tk) => tk.status !== 'completed' && !tk.parent_task_id);
    const completedCount = tasks.filter((tk) => tk.status === 'completed' && !tk.parent_task_id).length;
    const totalTasks = tasks.filter((tk) => !tk.parent_task_id).length;

    if (messages.length === 0) {
      // First message — overview suggestions
      if (activeTasks.length > 0) {
        chips.push(sv ? 'Ge mig en sammanfattning av jobbet' : 'Give me a job summary');
        chips.push(sv ? 'Vad ska jag prioritera?' : 'What should I prioritize?');
      }
      if (photos.some((p) => p.extracted_info)) {
        chips.push(sv ? 'Vad hittade du i bilderna?' : 'What did you find in the photos?');
      }
      if (tasks.length > 0) {
        chips.push(sv ? 'Gör en materiallista med E-nummer' : 'Make a material list with E-numbers');
      }
    } else {
      // Context-aware suggestions based on state
      if (activeTasks.length > 0 && activeTasks.length <= 5) {
        chips.push(sv ? 'Markera allt som klart' : 'Mark all tasks done');
      }
      if (completedCount > 0 && completedCount < totalTasks) {
        chips.push(sv ? `Vad \u00e4r kvar att g\u00f6ra?` : 'What is left to do?');
      }
      if (activeTasks.some((tk) => tk.source_photo_id)) {
        chips.push(sv ? 'Utveckla n\u00e4sta uppgift' : 'Expand next task');
      }
    }

    return chips.slice(0, 3);
  }, [tasks, photos, messages.length, language]);

  // Simple markdown-like formatter for AI messages
  const formatMessage = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (trimmed === '') return <div key={i} className="h-1.5" />;

      // Bullet points
      const bulletMatch = trimmed.match(/^[-•]\s+(.*)/);
      // Numbered list
      const numberMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/);

      let content = bulletMatch ? bulletMatch[1] : numberMatch ? numberMatch[2] : trimmed;

      // Bold **text**
      const parts: (string | React.JSX.Element)[] = [];
      let lastIdx = 0;
      const boldRegex = /\*\*(.+?)\*\*/g;
      let match;
      while ((match = boldRegex.exec(content)) !== null) {
        if (match.index > lastIdx) parts.push(content.slice(lastIdx, match.index));
        parts.push(<strong key={`b${i}-${match.index}`} className="font-semibold">{match[1]}</strong>);
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < content.length) parts.push(content.slice(lastIdx));
      const rendered = parts.length > 0 ? parts : content;

      if (bulletMatch) {
        return <div key={i} className="flex gap-1.5 ml-1"><span className="text-blue-400 flex-shrink-0">•</span><span>{rendered}</span></div>;
      }
      if (numberMatch) {
        return <div key={i} className="flex gap-1.5 ml-1"><span className="text-blue-400 font-medium flex-shrink-0">{numberMatch[1]}.</span><span>{rendered}</span></div>;
      }
      return <p key={i}>{rendered}</p>;
    });
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all z-30"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {messages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-full sm:w-96 sm:bottom-6 sm:right-6 z-30 flex flex-col bg-white dark:bg-gray-800 sm:rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[80vh] sm:max-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white sm:rounded-t-lg flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="font-medium">{t('chat.title')}</span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="text-white/70 hover:text-white text-xs transition-colors"
              title={t('chat.clear')}
            >
              {t('chat.clear')}
            </button>
          )}
          <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 scrollbar-thin">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            {t('chat.empty')}
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white whitespace-pre-wrap'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 space-y-1'
              }`}
            >
              {msg.role === 'assistant' ? formatMessage(msg.content) : msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-500 dark:text-gray-400">{t('chat.thinking')}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Options + Suggestions + Input */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-3">
        {!apiKey ? (
          <p className="text-sm text-center text-gray-400">{t('chat.noApiKey')}</p>
        ) : (
          <>
            {/* AI option buttons — interactive product/choice selection */}
            {activeOptions.length > 0 && !sending && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {activeOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(opt)}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {/* Quick-reply suggestion chips */}
            {activeOptions.length === 0 && suggestions.length > 0 && !sending && !input.trim() && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="px-2.5 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors truncate max-w-[200px]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
