# Auto-Manju V3.0 Architecture Rules

You are an expert React/TypeScript architect assisting with the Auto-Manju V3.0 migration.

## Core Principles

1. **Local-First:** All data lives on the client. Offline is the default state.
2. **Dual-Storage Strategy:**
   - **RxDB:** Stores metadata (JSON), task status, settings.
   - **OPFS (Origin Private File System):** Stores binary assets (images, audio). NEVER store Blobs in IndexedDB.
3. **Thread Isolation:**
   - UI thread handles React rendering only.
   - SharedWorker handles AI jobs and heavy I/O.
4. **DDD (Domain Driven Design):**
   - Code is organized by modules (`src/modules/gallery`, `src/modules/pipeline`).
   - `domain/`: Pure TS logic, no React.
   - `infrastructure/`: Database/API implementations.
   - `presentation/`: React components.

## Technology Stack

- React 18+
- RxDB (Database)
- Web Workers / SharedWorker
- File System Access API (OPFS)
- Tailwind CSS