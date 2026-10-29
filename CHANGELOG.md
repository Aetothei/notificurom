# Changelog

All notable changes to Notificurom starting from the v1.0.0 architecture rewrite are documented in this file.

## [1.0.3] - 2026-10-29

### Added
- **Browser Desktop Notifications**: Added native browser alerts whenever a new review request, pull request, or assigned issue appears on the board.
- **Background Task Sync**: Implemented background polling on a configurable interval while the tab is open (default 2 minutes).
- **Notification Controls & Testing**: Added a clean toggle and live permission indicator in the Settings modal with a **Send test alert** button.
- **Dedicated Ansible Directory**: Moved all deployment automation into `ansible/` (`ansible.cfg`, `inventory.yml`, `playbook.yml`, `requirements.yml`).
- **Schema Migration**: Auto-migrates SQLite `user_preferences` to add `notifications_enabled` without data loss.

---

## [1.0.2] - 2026-10-29

### Added
- **Custom SVG Favicon**: Added `public/favicon.svg` matching the dark obsidian glass and amber notification bell aesthetic, and removed leftover Next.js boilerplate assets from `public/`.
- **Changelog**: Added `CHANGELOG.md` tracking releases starting from `1.0.0`.

### Changed
- **Card Drag & Drop UX**: Made the entire card surface (including repository label and title text) purely draggable without competing click handlers or hover text highlights.
- **Simplified Card Hover Actions**: Removed the `<` and `>` column arrow buttons on cards, leaving only the floating **Open in GitHub (`↗`)** and **Remove (`Trash`)** actions on hover.
- **Badge & Pill Alignment**: Unified `StatBadge` and `AgeBadge` geometry (`h-6 px-2.5 leading-none`) using `tailwind-merge` so `PR`, `Review`, `Issue`, and `Age` pills match optically.
- **Search Input Pill**: Fixed backdrop-filter compositing on the search pill so the search icon and left padding render cleanly.
- **Deployment & Docker Cleanup**: Added `.dockerignore`, removed obsolete `docker-compose.yml` version header, and cleaned up legacy Next.js files (`postcss.config.mjs`, `next.config.ts`) in `playbook.yml`.

---

## [1.0.1] - 2026-10-29

### Changed
- **Navbar Cleanup**: Removed the active task count badge and standalone settings gear icon; moved the `@user` dropdown menu to the far right (after `Sync`) and simplified the search placeholder to `Filter tasks...`.
- **Compact Multi-Column Layout**: Enabled 5-column layout from `lg` screens upward (`lg:grid-cols-5`) with tighter padding so all columns fit comfortably on laptop displays.
- **Card & Empty Column Refinements**: Prevented `Age` badges from wrapping onto two lines (`whitespace-nowrap`), muted the organization prefix (`org/`) on repository names, dimmed cards in the `Done` column, and removed the nested double-box container on empty columns.

---

## [1.0.0] - 2026-10-29

### Added
- **Zero-Data-At-Rest Architecture**:
  - Replaced legacy plaintext SQLite tables with pointer-only `task_states` (`HMAC-SHA256` item/user hashes, column status, sort order, and timestamps) and `user_preferences`.
  - Moved GitHub OAuth session and tokens into stateless **AES-256-GCM encrypted HTTP-only cookies** (`notificurom_session`).
  - Added short-lived per-user RAM caching for live GitHub issue/PR hydration and automatic pruning of stale pointer hashes.
  - Added optional `ALLOWED_GITHUB_USERS` environment allowlist.
- **Vite + React 19 SPA & Lightweight Node Server**:
  - Replaced Next.js with a fast Vite SPA, `shadcn/ui` primitives (`radix-ui`), `@fontsource-variable/geist`, `@iconify/react`, and a single Node HTTP server (`server/index.ts`).
- **Borderless Glassmorphic Dashboard UI**:
  - Redesigned the board, login view, and `GlassModal` settings dialog with ambient radial glow blobs and borderless frosted glass surfaces.
  - Added inline filter capsules (`All`, `PRs`, `Reviews`, `Issues`), full-card drag-and-drop, login status polling, and a **Wipe Board Data** danger zone action.
- **Release-Driven Deployment**:
  - Updated `.github/workflows/deploy.yml` to deploy only when a GitHub Release is published (or via manual `workflow_dispatch`).
