# NoteForge — YouTube to Smart Notes

A beautiful, professional split-screen web app that transforms YouTube video transcripts into structured, actionable notes.

## Features

- **Split-Screen Layout** — YouTube video on the left, smart notes editor on the right
- **Transcript Extraction** — Automatically fetches and parses YouTube captions
- **AI-Powered Note Generation** — Analyzes transcript to produce summaries, key topics, chapter breakdowns, and action items
- **Rich Text Editor** — Bold, italic, headings, lists, quotes, code blocks, timestamps, and more
- **Clickable Timestamps** — Jump to any point in the video from your notes
- **Dark & Light Themes** — Toggle between beautiful dark and light modes
- **Auto-Save** — Notes are automatically saved to localStorage
- **Export** — Download notes as a clean, styled HTML file
- **Resizable Panels** — Drag the divider to adjust the split
- **Keyboard Shortcuts** — Ctrl+B/I/U for formatting, Ctrl+S to save, Ctrl+E to export

## How to Use

1. Paste any YouTube URL in the top bar
2. Click **Load** to embed the video
3. Click **Get Transcript** to extract captions
4. Click **Generate Notes** to auto-create structured notes
5. Edit, format, and export your notes

## Tech Stack

- Pure HTML/CSS/JavaScript — no build step required
- YouTube IFrame API for video embedding
- Browser-native contentEditable for rich text editing
- CSS custom properties for theming

## Getting Started

Simply open `index.html` in a browser, or serve with any static file server:

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .
```

## License

MIT
