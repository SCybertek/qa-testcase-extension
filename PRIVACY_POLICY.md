# Privacy Policy

_Last updated: March 17, 2026_

his Privacy Policy describes how the QA Test Case Generator extension handles data.

## 1) Data We Process

When you use the extension, selected requirement text may be sent to a backend API endpoint to generate QA test cases.

Data categories:
- Selected requirement text you explicitly choose- Technical request metadata (for reliability and debugging)- Generated test case output

## 2) Purpose of Processing

We process this data only to:
- Generate QA test cases- Improve reliability (for example: deterministic mode and count consistency)- Diagnose operational issues

## 3) Data Storage

The extension may store limited local cache data in browser storage to support offline fallback and deterministic reuse.
Stored locally may include:
- Normalized prompt key- Generated output- Count metadata- Timestamp
This local cache remains in your browser until cleared by you or overwritten by newer entries.

## 4) Data Sharing

Selected text is sent to:
- Your configured backend service- The AI provider used by that backend
We do not sell personal data.

## 5) Security

We recommend:
- Using HTTPS for backend endpoints in production- Restricting backend CORS and request origins- Using API keys securely via environment variables- Applying authentication and rate limits on backend routes

## 6) Retention

Server-side retention depends on your backend implementation and hosting logs.If you do not wish to retain request content, disable request logging and configure short log retention.

## 7) User Controls

You can:
- Clear cached output using the extension's **Clear Cache** button- Stop using the extension at any time- Remove the extension to delete extension data from your browser profile

## 8) Children’s Privacy

This extension is not intended for children under 13.

## 9) Changes to This Policy

We may update this policy as the product evolves. The latest version should be published at a stable URL.

## 10) Contact

For privacy questions, contact:
- `snuryyeva@gmail.com`
