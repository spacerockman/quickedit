# AI Project Log

This file is the required handoff record for every AI or human editor working on this project. Update it before every commit and before every GitHub push.

## Rules For Future AI Editors

- Record every meaningful change in the latest log entry.
- Include evidence: command results, file paths changed, verification steps, or known blockers.
- Do not remove previous entries unless the user explicitly asks.
- If a GitHub push cannot be completed, record the exact reason and the next command or setup step needed.
- Keep this file concise, factual, and useful for another AI to continue the project without guessing.

## Project Summary

- App: Lightweight file:// based text editor using CodeMirror 6.
- Zero runtime dependencies — opens directly from `file://` in any modern browser.
- Frontend: single HTML + bundled JS + CSS. Built with esbuild.
- Default port: None (no server — just open the HTML file).
- macOS auto-open at login: `launchd` LaunchAgent via `open` command.

## Operational Commands

```bash
npm run build           # Bundle editor after changing editor.js
open public/index.html  # Open editor in default browser

# LaunchAgent management
cp macos/com.spacerockman.quickedit.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.spacerockman.quickedit.plist
launchctl unload ~/Library/LaunchAgents/com.spacerockman.quickedit.plist
```

## GitHub Push Policy

The user's standing instruction is: after each project edit, commit and push changes to GitHub.

Current status:

- GitHub remote is configured as `origin https://github.com/spacerockman/quickedit.git`.
- Branch `main` tracks `origin/main`.

After a remote is configured, future AI editors must run:

```bash
git status --short
git add AI_PROJECT_LOG.md <changed-files>
git commit -m "<clear summary>"
git push
```

## Change Log

### 2026-06-24 - Initial project setup

Changed files:

- Added `package.json`, `bundle.mjs`, `public/editor.js`, `public/index.html`, `public/style.css`.
- Added `macos/com.spacerockman.quickedit.plist`.
- Added `AI_PROJECT_LOG.md`, `.gitignore`.

What was completed:

- Set up file:// based text editor using CodeMirror 6 with esbuild bundling.
- Editor features: syntax highlighting (JS/TS/Python/Markdown/HTML/CSS/JSON), dark/light theme, file open via drag-drop or Cmd+O, save as download via Cmd+S, localStorage auto-save, line/word count status bar.
- LaunchAgent opens editor at login via `open` command (no background server).
- Zero runtime dependencies — editor is a single self-contained bundle.

Evidence:

- `npm run build` produces `public/editor.bundle.js`.
- `open public/index.html` loads the editor in browser.

Push status:

- Pending.
