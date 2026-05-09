# evid — Tiny local calendar & reminders (Tauri + Rust)

evid is a small desktop side-project built with Tauri (TypeScript + Preact) and Rust. It provides a compact calendar, local one‑off reminders, anniversary tracking, and a lightweight tray UI. Data is stored locally as JSON; the app runs a background reminder loop and shows native notifications.

Features
- Local one‑off reminders with optional time
- Anniversary tracking with lead‑time reminders (30d, 7d, 1d, today)
- Tray icon with pause/resume reminders and quick open
- Rich-text note editor for entries
- JSON persistence in the app data directory

Quick start (development)
1. Install dependencies and run the frontend dev server:

```powershell
npm install
npm run dev
```

2. In another terminal run the Tauri dev app:

```powershell
npm run tauri -- dev
```

Building icons and installers
1. Place your square PNG at `src-tauri/icons/icon.png` (recommended 1024x1024).
2. Generate platform icons:

```powershell
npm run icons:generate
```

3. Build a production bundle (creates installers in `src-tauri/target/release/bundle`):

```powershell
npm run tauri -- build
```

Notes
- Notifications may appear with different attribution while running in dev mode; install the packaged app to ensure notifications are attributed to the application.
- Data files: `evid-data.json` and `evid-reminder-state.json` live in the OS app data folder for `evid`.

Contributing
- This is a small side project — feel free to open issues or pull requests. The codebase uses Preact + TypeScript for the UI (`src/`) and Rust for the Tauri backend (`src-tauri/src/`).

License
- GNU General Public License v3.0
- See `LICENSE` for the full text.
