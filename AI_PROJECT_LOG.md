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

### 2026-06-24 - Add temp file backing + double-click rename

Changed files:

- Updated `public/editor.js`, `public/style.css`, `public/editor.bundle.js`.

What was completed:

- **Temp file in ~/Downloads/temp/**: Blank/untitled state is now backed by a real `temp.txt` file. Uses File System Access API `showDirectoryPicker` — user selects the temp folder once (e.g. ~/Downloads/temp/), directory handle is stored in IndexedDB for persistence across reloads.
- **Auto-save to file**: Auto-save now writes to the file handle (in addition to localStorage) when available. Debounced 2s.
- **Double-click rename**: Double-click the filename tag in the toolbar to rename inline. Enter to confirm, Esc to cancel. For temp files: creates new file with new name in temp dir, deletes old file. For external files: updates display name, clears handle for save-as on next save.
- **Close creates new temp.txt**: Closing a file creates a fresh empty temp.txt in the temp directory (if dir handle is available with permission).
- **Session tracking**: `localStorage["quickedit-is-temp"]` tracks whether last session was a temp file or an external file. On reload, temp sessions load temp.txt; external sessions restore the filename from `localStorage["quickedit-last-filename"]`.
- **CSS**: Added `#filename-edit` styling for the inline rename input, `cursor: pointer` and `user-select: none` on `#filename`.

First-time setup:
1. Open editor → blank state, filename shows "temp.txt" (no real file yet)
2. Click Save → directory picker appears → select ~/Downloads/temp/
3. temp.txt is created in that folder, content is saved
4. On subsequent reloads, temp.txt is loaded automatically (no picker needed)

Evidence:

- `npm run build` built successfully.
- `node --check public/editor.bundle.js` passed.
- Key constants verified in bundle: "temp-dir", "temp.txt", "quickedit-fs", "quickedit-is-temp", "readwrite", showDirectoryPicker, renameFile, closeFile.

Push status:

- Pending.

### 2026-06-24 - Add Close file feature

Changed files:

- Updated `public/editor.js`, `public/index.html`, `public/editor.bundle.js`.

What was completed:

- **Close button**: Added to toolbar between Save and filename.
- **closeFile()**: Clears editor content, resets file handle and filename to Untitled, clears localStorage content. Prompts confirm dialog if there are unsaved changes.
- **Cmd+W shortcut**: Closes the current file (overridden with preventDefault so browser tab doesn't close).
- **HTML default class**: Changed `class="dark"` to `class="light"` on `<html>` to match the light default theme (prevents dark flash before JS loads).
- **Status hint**: Updated to show Cmd+W instead of Cmd+S.

Evidence:

- `npm run build` built successfully.
- `editor.js` closeFile function and Cmd+W handler verified.

Push status:

- Complete. Commit `1e1d55f` pushed to `origin/main`.

### 2026-06-24 - Remove Cmd+S save shortcut + default light theme

Changed files:

- Updated `public/editor.js`, `public/editor.bundle.js`.

What was completed:

- **Cmd+S no longer saves**: Removed `saveFile()` call from Cmd+S handler. The key is still suppressed (`preventDefault`) so the browser's native "Save Page" dialog doesn't appear either. Saving is now done via the toolbar Save button only.
- **Default theme changed to light**: Default value in `isDark()` changed from `"dark"` to `"light"`. First-time users now see the white theme. Existing users keep their localStorage preference.

Evidence:

- `npm run build` built successfully.
- `editor.js` lines 45, 292 verified.

Push status:

- Pending.

### 2026-06-24 - Fix Cmd+S save behavior + 7 UX improvements

Changed files:

- Updated `public/editor.js`, `public/index.html`, `public/style.css`, `public/editor.bundle.js`.

What was completed:

- **Cmd+S normal save**: Uses File System Access API to write back to the opened file. Falls back to `showSaveFilePicker` for new files, and download for legacy browsers.
- **Cmd+O native picker**: Uses `showOpenFilePicker` when available, stores file handle for save-back.
- **Drag-drop overlay fix**: `dragenter`/`dragleave` now properly toggle `dragover` class on `#app`.
- **Unsaved indicator**: `•` prefix in filename and browser tab title when content is dirty.
- **Cursor position**: Status bar shows `Ln X, Col Y` with live tracking.
- **Save button**: Added to toolbar alongside Open button.
- **Keyboard shortcut fix**: Case-insensitive key matching (`e.key.toLowerCase()`).
- **Beforeunload warning**: Prompts before closing tab with unsaved changes.
- **CSS cleanup**: Removed redundant selectors, added `.cm-activeLine` highlight.

Evidence:

- `node bundle.mjs` built successfully (643 KB).
- `node --check public/editor.bundle.js` passed.
- All 6 global functions confirmed present in bundle.

Push status:

- Complete. Commit `535e4be` pushed to `origin/main`.

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

- Complete. Commit `422837c` pushed to `origin/main`.
