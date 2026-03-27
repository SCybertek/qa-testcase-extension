# QA Test Case Generator Extension

Chrome extension that generates QA test cases from selected requirement text, with deterministic mode, count controls, offline fallback, and CSV export.

## Features

- Right-click selected text and generate test cases
- AI generation with deterministic mode and exact target count
- Count logging and user-visible count status
- Offline fallback chain:
  - cached AI result (if available)
  - local deterministic template generator
- Copy and CSV export
- Clear cache control in panel

## Architecture

- Extension UI + logic:
  - [content.js](content.js)
  - [background.js](background.js)
- Extension config:
  - [manifest.json](manifest.json)
- Backend API:
  - Hosted separately (recommended in a dedicated backend repo/folder)

## Local Setup (Extension)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Local Setup (Backend)

Create a separate backend project (for example `qa-testcase-backend`) and keep it outside this extension repository.

In that backend project, install deps:

- `npm init -y`
- `npm install express cors openai dotenv`

Create `.env`:

- `OPENAI_API_KEY=your_key_here`
- `OPENAI_MODEL=gpt-4o-mini` (optional)
- `PORT=3000` (optional)

Run backend:

- `node server.js` (from your backend project)

Health check:

- `GET http://localhost:3000/health`

## Production Deployment

1. Deploy backend to Render/Railway/Fly/Azure/etc.
2. Replace local URL in [background.js](background.js) with your hosted URL
3. Update host permissions in [manifest.json](manifest.json) to your backend domain
4. Reload extension

## Deterministic Behavior Tips

- Keep **Deterministic** enabled in panel
- Keep requirement text and target count unchanged
- Use backend temperature `0` for deterministic mode
- Keep same model version and prompt contract

## Chrome Web Store Checklist

- Extension name, summary, and screenshots/GIF
- Publishable docs in [README.md](README.md)
- Public privacy policy URL (see [PRIVACY_POLICY.md](PRIVACY_POLICY.md))
- Public terms URL (see [TERMS.md](TERMS.md))
- Support email/contact details
- Clear disclosure that selected text is sent to backend AI service

## Promotion Ideas

- Post short demo video/GIF on LinkedIn and QA communities
- Share before/after productivity examples
- Add changelog updates to show active maintenance
- Offer a free early-adopter feedback form

## Troubleshooting

- If AI is unreachable, extension falls back to cached/local generation
- If count shows unavailable, inspect backend response format and logs
- Use browser console logs from content/background scripts for diagnostics

## License

Proprietary licence template is included in [LICENSE](LICENSE)