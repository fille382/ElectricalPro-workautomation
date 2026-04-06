# AI Chat per Job

## Overview
Add a chat interface on the JobDetailPage where the user can message the AI about their job. The AI has full context: job details, all photos, all tasks (with status), and can help with questions, mark tasks as discussed, and reference photos.

## Implementation

### 1. Add `ChatMessage` type to `src/types/index.ts`
```ts
export interface ChatMessage {
  id: string;
  job_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}
```

### 2. Add `chat_messages` store to IndexedDB (`src/utils/db.ts`)
- Add new object store in `onupgradeneeded` (bump DB_VERSION to 3)
- Add CRUD functions: `getChatMessages(jobId)`, `addChatMessage(msg)`, `clearChatMessages(jobId)`

### 3. Add `useChat` hook to `src/hooks/useIndexedDB.ts`
- Load messages for a job
- `sendMessage(content)` — saves user message, calls AI, saves response

### 4. Add `chatWithJob()` to `src/utils/claude.ts`
- Takes: user message, conversation history, job context (name, description, address), task summaries (title + status), photo summaries (component_type, condition, recommendations)
- System prompt: "You are an electrical expert assistant. You have context about this job..."
- Sends conversation history as messages array (multi-turn)
- Does NOT send photos as images (too expensive) — sends the extracted_info summaries instead
- Returns assistant text response

### 5. Create `src/components/JobChat.tsx`
- Collapsible chat panel at the bottom of JobDetailPage (like a chat widget)
- Shows message history with user/assistant bubbles
- Text input + send button
- Auto-scrolls to latest message
- Loading spinner while AI responds
- "Clear chat" button

### 6. Wire up in `JobDetailPage.tsx`
- Add `<JobChat>` component below the existing content
- Pass: jobId, apiKey, job, tasks, photos

### 7. Add i18n keys to `en.ts` and `sv.ts`
- `chat.title`, `chat.placeholder`, `chat.send`, `chat.clear`, `chat.thinking`, `chat.noApiKey`

## Design decisions
- Chat is per-job, persisted in IndexedDB so it survives page reloads
- Photos are NOT sent as images to the chat (too expensive) — only their analysis summaries
- Multi-turn conversation with full history sent each time
- Collapsible so it doesn't take up screen space when not needed
- Floating button on mobile to open chat
