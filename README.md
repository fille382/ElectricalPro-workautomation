# ElectricalPro - Swedish Electrician Work Management

A mobile-first web app for Swedish electricians to manage jobs, capture panel photos, and get AI-powered analysis with automatic task generation.

## Features

- **Job Management** - Create jobs with address/description, track task progress with visual progress bars
- **AI Panel Analysis** - Photograph electrical panels and get instant Claude Vision analysis (manufacturer, voltage, condition, compliance)
- **Auto Task Creation** - AI recommendations automatically become actionable work tasks
- **Task Drill-Down** - Click any AI-generated task to get detailed explanation with sub-task breakdown
- **Sub-Task Checklists** - Each explained task generates checkable sub-steps for on-site work
- **i18n** - Full Swedish and English support (AI responses follow language setting)
- **Dark Mode** - System-aware dark theme throughout
- **Offline-First** - All data stored locally in IndexedDB, works without internet
- **Mobile Camera** - Capture photos directly from device camera

## Tech Stack

- React 19 + TypeScript + Vite 7
- Tailwind CSS v4
- Claude API (Vision) via `@anthropic-ai/sdk`
- IndexedDB for local storage
- React Router v7

## Quick Start

```bash
npm install
npm run dev
```

Add your Claude API key in the app's Settings page. Get one from [Anthropic Console](https://console.anthropic.com/account/keys).

## Project Structure

```
src/
├── components/     # CameraCapture, PhotoGallery, PhotoDetail, JobForm, TaskForm
├── contexts/       # I18nContext (language provider)
├── hooks/          # useIndexedDB, useClaude
├── i18n/           # en.ts, sv.ts translation files
├── pages/          # JobListPage, JobDetailPage, SettingsPage
├── types/          # TypeScript interfaces (Job, Task, Photo)
└── utils/          # claude.ts (API), db.ts (IndexedDB)
```

## How It Works

1. Create a job (name, address, description)
2. Take photos of electrical panels
3. AI automatically analyzes the photo and creates tasks
4. Click any task to get a detailed breakdown with sub-steps
5. Check off sub-tasks as you complete work on site

## Data & Privacy

All data stays in your browser's IndexedDB. Photos and job data are never sent anywhere except to the Claude API for analysis (when you have an API key configured).
