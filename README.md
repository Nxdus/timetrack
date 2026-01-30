# TimeTrack (VS Code Extension)

## Description

TimeTrack is a Visual Studio Code extension that tracks your active coding time automatically and summarizes it in a visual dashboard. It groups time by project (workspace folder) and by date, then presents totals for today, a selectable date range, the current month, and all time. It also provides language and framework breakdowns based on the files you edit and the dependencies detected in each workspace.

## Features

- Automatic Active Coding Time tracking while you work in VS Code
- Project-based and day-based tracking (workspace folder + YYYY-MM-DD)
- Live status bar timer with active/idle indicator
- Dashboard cards for today, selected range, this month, and all time
- Stacked bar chart that compares project time by day
- Pie charts for language and framework breakdowns
- History table with paging and per-day delete (today is protected)
- One-click reset to clear all stored history

## Quick Start

1. Open VS Code and work normally
2. Watch the timer in the Status Bar (bottom-right)
3. Open the dashboard using:
   - `TimeTrack: Open Stats`

## Commands

- `TimeTrack: Open Stats` - Open the stats dashboard (Webview)
- `TimeTrack: Reset All Data` - Remove all stored history (confirmation required)

## How Tracking Works

- Time ticks every 1 second
- Only counts time while youre considered active:
  - Recent activity within **1 minute** (typing/selection/editor changes)
  - VS Code window is focused
  - A workspace is open
- Project is identified by **workspace folder name**
- Today's time updates in real-time and is persisted periodically

## Language & Framework Detection

- Language comes from the active document `languageId` and is normalized for readability
- Frameworks are inferred from `package.json` and common config files, including:
  - Next.js, Nuxt, Angular, Vue, React, Svelte, Astro, Remix
  - NestJS, Express, Fastify, Koa, Vite
  - Django, Rails
- If no match is found, it falls back to `Unknown`

## Data Storage & Privacy

- All data is stored **locally** in VS Code `globalState`
- No external network calls or sync
- Storage keys:
  - `timetrack.history`
  - `timetrack.languageHistory`
  - `timetrack.frameworkHistory`

## Tech Stack & Structure

- VS Code Extension (TypeScript, Webpack)
- Webview UI (React 19 + Vite)
- UI components: shadcn + Tailwind CSS
- Charts: Recharts

Key paths:

- `src/extension.ts` - tracking logic, persistence, commands
- `webview-ui/` - stats dashboard frontend
- `dist/` - build output used by the extension

## Development

### Requirements

- Node.js (LTS recommended)
- VS Code

### Install

```bash
npm install
npm run webview:install
```

### Dev

```bash
npm run webview:dev
npm run watch
```

### Build

```bash
npm run compile
```

### Package

```bash
npm run package
```

## Notes

- This extension does not contribute any VS Code settings via `contributes.configuration`
- Today's rows cannot be deleted to avoid conflicts with live tracking

## License

MIT
