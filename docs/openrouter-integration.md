# OpenRouter model integration

## Runtime
- Cloudflare Worker exposes `GET /api/ai/models` and `POST /api/ai/chat`.
- The model catalog is fetched from OpenRouter and cached in the Worker isolate for five minutes.
- Browser selection stores the OpenRouter model ID, not a hard-coded display label.
- Chat requests are streamed as Server-Sent Events from OpenRouter to the browser.
- `OPENROUTER_API_KEY` and `OASIS_DEMO_ACCESS_CODE` are Cloudflare Worker Secrets; neither is sent to the browser.

## Cloudflare secrets
- `OPENROUTER_API_KEY`: required for paid/free model inference.
- `OASIS_DEMO_ACCESS_CODE`: required to protect chat inference from public abuse.

## Verification
- Open the Oasis homepage and confirm the model list loads from OpenRouter.
- Search for a provider/model and select its live model ID.
- Enter the private demo access code in the conversation page and send a message.
- Confirm tokens stream into the assistant message and usage is shown when OpenRouter includes it.
- Confirm invalid access code, missing API key, and provider errors fail closed.

The strategy committee and simulated trading workflow are still demo-only; this milestone only makes the primary strategy-advisor model selection and chat inference real.
