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

### 2026-06-25 - Make @md a persistent Markdown mode switch

Changed files:

- Updated `public/editor.js`, `public/editor.bundle.js`.

What was completed:

- Changed `@md` from a one-shot trigger into a persistent first-line mode switch.
- If the first line is `@md`, the editor enters Obsidian-like live Markdown preview mode.
- Deleting or changing the first-line `@md` exits live Markdown mode.
- Removed `quickedit-wysiwyg` localStorage mode persistence so the document content is the single source of truth.
- The toolbar MD toggle now inserts or removes the first-line `@md` switch.

Evidence:

- `npm run build` built successfully.
- `node --check public/editor.js` passed.
- `node --check public/editor.bundle.js` passed.

Push status:

- Pending.

### 2026-06-25 - Make @md trigger instant full-editor Markdown rendering

Changed files:

- Updated `public/editor.js`, `public/editor.bundle.js`, `public/style.css`.

What was completed:

- Changed `@md` activation from Enter-only to instant activation when the first line becomes `@md`.
- The trigger line is removed before autosave so `@md` does not remain in the document.
- Added a `wysiwyg-active` app class while Markdown WYSIWYG mode is active.
- Hid editor gutters and added prose-style editor padding in WYSIWYG mode so the whole editor reads like a live Markdown page.

Evidence:

- `npm run build` built successfully.
- `node --check public/editor.js` passed.
- `node --check public/editor.bundle.js` passed.

Push status:

- Pending.

### 2026-06-25 - Improve word count, language selection, and autosave status

Changed files:

- Updated `package.json`, `package-lock.json`, `public/editor.js`, `public/editor.bundle.js`, `public/index.html`, `public/style.css`.

What was completed:

- Fixed word counting to handle mixed English, numbers, and CJK text. CJK characters now count individually; English/number runs count as words.
- Added common CodeMirror language packages and automatic syntax highlighting by file extension for JavaScript, TypeScript, JSX/TSX, Python, Markdown, HTML/XML/SVG, CSS, JSON, C/C++, Go, Java, PHP, Rust, SQL, Vue, and YAML.
- Added a bottom-right language selector with Auto mode. Manual selection overrides the current file extension for syntax highlighting.
- Made autosave status visible in the status bar. Autosave remains always on: file handles are written when available, otherwise content is saved locally for recovery.

Evidence:

- `npm install -D @codemirror/lang-cpp @codemirror/lang-go @codemirror/lang-java @codemirror/lang-php @codemirror/lang-rust @codemirror/lang-sql @codemirror/lang-vue @codemirror/lang-yaml` completed with 0 vulnerabilities.
- `npm run build` built successfully.
- `node --check public/editor.js` passed.
- `node --check public/editor.bundle.js` passed.

Push status:

- Pending.

### 2026-06-25 - Fix cursor status crash and tighten preview DOM updates

Changed files:

- Updated `public/editor.js`, `public/editor.bundle.js`.

What was completed:

- Fixed a runtime crash in `updateCursorPos()`: CodeMirror `Line.from` is a numeric property, not a function.
- Changed the non-Markdown preview hint to use DOM APIs instead of assigning an HTML string.
- Kept Markdown preview rendering through `marked.parse()`, but now clears and appends parsed content through a template node.

Evidence:

- `npm run build` built successfully.
- `node --check public/editor.js` passed.
- `node --check public/editor.bundle.js` passed.

Push status:

- Pending.

### 2026-06-25 - Add WYSIWYG Markdown mode (@md trigger)

Changed files:

- Updated `package.json` (added `@atomic-editor/editor` devDep), `public/editor.js`, `public/index.html`, `public/style.css`, `public/editor.bundle.js`, `public/atomic-preview.css` (new).

What was completed:

- **Typora-style inline WYSIWYG**: Type `@md` on first line + press Enter → `@md` auto-deletes, WYSIWYG mode activates. Markdown syntax (headings, bold, italic, code, links, lists, blockquotes) renders inline — raw syntax hidden on non-cursor lines, visible on the line being edited.
- **Package**: `@atomic-editor/editor` v0.4.3 — zero npm deps, zero React, 39KB core extension. Uses CM6 `ViewPlugin` + `Decoration.replace` (same approach as Obsidian). Document stays pure markdown — byte-for-byte round-trip.
- **Toggle**: Click MD badge in toolbar or Cmd+Shift+M to exit WYSIWYG mode. State persists in `localStorage["quickedit-wysiwyg"]`.
- **Theme integration**: `--atomic-editor-*` CSS variables mapped to existing light/dark theme variables. `data-theme` attribute on `#editor` toggles atomic-editor light/dark CSS.
- **Preview disabled in WYSIWYG**: Split preview is redundant with inline rendering — `togglePreview` returns early when WYSIWYG is active.
- **Bundle size**: 643KB → 702KB (+59KB for inline preview extension). CSS: 26KB separate file.

Evidence:

- `npm run build` built successfully (702 KB bundle, 0 React references).
- `open public/index.html` opened editor in browser.

Push status:

- Pending.

### 2026-06-24 - Add Markdown preview feature

Changed files:

- Updated `package.json` (added `marked` devDep), `public/editor.js`, `public/index.html`, `public/style.css`, `public/editor.bundle.js`.

What was completed:

- **Three-state preview toggle**: Off → Split (editor + preview side by side) → Full (preview only) → Off. Cycle via toolbar Preview button or Cmd+P.
- **Markdown rendering**: Uses `marked` library (bundled via esbuild, zero runtime deps). Renders headings, code blocks, lists, blockquotes, tables, links, images, hr.
- **Live update**: Preview refreshes on every doc change when preview mode is active.
- **Non-MD files**: Shows hint message "Preview is only available for Markdown (.md) files".
- **CSS**: Full markdown element styling for both light/dark themes.
- **Layout**: `#app.preview-split` class for 50/50 split, `#app.preview-full` for preview-only.

Push status:

- Complete.

### 2026-06-24 - Fix Cmd+W closing browser tab

Changed files:

- Updated `public/editor.js`, `public/editor.bundle.js`.

What was completed:

- **Capture-phase listener**: Moved keyboard shortcut listener from `document` (bubble phase) to `window` (capture phase, `true`). This intercepts keydown events before the browser processes them.
- **stopPropagation**: Added `e.stopPropagation()` alongside `e.preventDefault()` to prevent the event from reaching browser-level handlers.
- **CodeMirror keymap**: Added `Mod-w` binding to CM6 keymap so Cmd+W is caught even when the editor has focus (CM6 processes events before bubbling).
- All shortcuts (S/O/W/B) now use capture + stopPropagation.

Push status:

- Complete.

### 2026-06-24 - Default temp folder: Downloads/tmp/

Changed files:

- Updated `public/editor.js`, `public/editor.bundle.js`.

What was completed:

- **Auto-create tmp subfolder**: Directory picker now opens at Downloads (`startIn: 'downloads'`). After user selects Downloads, `getDirectoryHandle('tmp', { create: true })` automatically creates/uses a `tmp/` subfolder inside it. temp.txt is saved in `Downloads/tmp/`.
- **No manual folder navigation needed**: User just selects Downloads, the tmp subfolder is handled automatically.

Note: If you previously selected a different folder, the old handle in IndexedDB is still used. To re-pick, clear site data or the editor will keep using the stored handle.

Push status:

- Complete.

### 2026-06-24 - Cmd+W now saves then closes

Changed files:

- Updated `public/editor.js`, `public/editor.bundle.js`.

What was completed:

- **Cmd+W = save + close**: Previously Cmd+W asked to discard unsaved changes. Now it saves the current content first, then closes the file (creates fresh temp.txt). If save fails or is cancelled, the close is aborted.
- **Toolbar Close button = discard + close**: The Close button keeps the old behavior (confirm dialog to discard unsaved changes). `closeFile(discard)` parameter controls this.
- **closeFile signature**: Changed to `closeFile(discard = true)`. `discard=true` shows confirm dialog; `discard=false` saves first.

Evidence:

- `npm run build` built successfully.
- `node --check public/editor.bundle.js` passed.

Push status:

- Complete. Commit `00d1f9e` pushed to `origin/main`.

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

- Complete. Commit `2115f88` pushed to `origin/main`.

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
