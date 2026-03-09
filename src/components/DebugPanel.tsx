import { useState, useRef, useEffect } from 'react';
import { useDebugLog } from '../contexts/DebugLogContext';

const levelColors = {
  log: 'text-gray-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

export default function DebugPanel() {
  const { logs, enabled, clear } = useDebugLog();
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<'all' | 'error'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = filter === 'error' ? logs.filter((l) => l.level === 'error') : logs;
  const errorCount = logs.filter((l) => l.level === 'error').length;

  // Auto-scroll to bottom
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs.length, expanded]);

  if (!enabled) return null;

  // Collapsed: small floating button
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white text-xs font-bold ${errorCount > 0 ? 'bg-red-600' : 'bg-gray-700'}`}
      >
        {errorCount > 0 ? errorCount : 'LOG'}
      </button>
    );
  }

  // Expanded: full log panel
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t-2 border-gray-600 shadow-2xl" style={{ maxHeight: '50vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-bold">Debug Log</span>
          <span className="text-gray-400 text-xs">({filteredLogs.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter(filter === 'all' ? 'error' : 'all')}
            className={`px-2 py-0.5 text-xs rounded ${filter === 'error' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}
          >
            {filter === 'error' ? 'Errors' : 'All'}
          </button>
          <button onClick={clear} className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
            Clear
          </button>
          <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="overflow-y-auto p-2 space-y-0.5" style={{ maxHeight: 'calc(50vh - 40px)' }}>
        {filteredLogs.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">No logs yet</p>
        ) : (
          filteredLogs.map((entry) => (
            <div key={entry.id} className="flex gap-2 text-xs font-mono leading-relaxed">
              <span className="text-gray-500 flex-shrink-0">{entry.time}</span>
              <span className={`${levelColors[entry.level]} flex-shrink-0`}>
                [{entry.level.toUpperCase()}]
              </span>
              <span className="text-gray-200 break-all">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
