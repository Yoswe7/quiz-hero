# AI provider configuration

The backend uses Groq for quiz generation, answer grading, and Hero Bot chat.
Set `GROQ_API_KEY` in the backend environment. The default model is
`qwen/qwen3.8-27b`; configure `GROQ_MODEL` and `GROQ_CHAT_MODEL` to override it.

The default model supports image input and JSON output. It is currently listed
as a preview model by Groq, so verify model availability before production use.
PDF text is extracted locally when available. Scanned pages are rendered locally
and transcribed in batches of up to three images by Groq. PDFs are limited to 60
pages and 100,000 extracted text characters per assessment.

Never commit API keys or place them in frontend configuration.