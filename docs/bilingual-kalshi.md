# Chinese / English and Kalshi API

The site defaults to Simplified Chinese. The upper-right language button switches UI copy and persists only the validated preference in `oasis-language`. The main workspace, dynamically generated controls, funds/receive panels, ETH and prediction cards, account dialogs, admin dashboard and setup helper share the same ES module. The locale is sent to advisor requests. Existing user text/history, wallet addresses, transaction packets and option values are preserved. Previously saved messages remain in their original language.

Market titles may be translated into Chinese for reference using the existing server-side OpenRouter configuration. Only public titles fetched from a fixed platform endpoint are sent. There is no arbitrary user-text translation endpoint. Activated Google sessions, a bounded cache, two concurrent requests and per-user/global hourly limits bound this service. `OASIS_TRANSLATION_MODEL` optionally overrides `openai/gpt-4o-mini`. Missing, invalid or unavailable translations retain the official original. Translations are labeled as reference text and never select an asset, price, outcome, account or trade parameter. Platform rules and English originals remain available for verification.

## User configuration

1. Log into the intended production Kalshi account, then open **Account & security → API Keys → Create Key**: https://kalshi.com/account/profile . A demo key from https://demo.kalshi.co is a separate environment.
2. Request only `read` and `write::trade` scopes. Keep the Key ID and downloaded Ed25519 or RSA private-key file. Transfer scope is unnecessary.
3. In Oasis, open a prediction market, compare platforms and choose **Kalshi**. Choose production or demo, enter the Key ID and select the private-key file in the Kalshi card.
4. Connect and review the account's USD balance, event, outcome, quantity, price and fee reserve. Choose the existing principal wallet for the common order lock if none is selected, then explicitly confirm the purchase.

No Kalshi private key should be added to a shared Cloudflare secret, committed to Git or sent in chat. Private keys are imported as non-extractable WebCrypto keys in page memory; no PEM, Key ID, signature or authentication header is stored in journals or telemetry. Closing/refreshing the page or changing the Oasis account disconnects this session.

Kalshi uses its own platform USD balance and exchange shard, not Arbitrum USDC or Polygon pUSD. Funding is completed on Kalshi. Oasis exposes no transfer or withdrawal endpoint, no API-key management route, no bulk orders and no arbitrary proxy.

## Execution policy and limits

The adapter uses current `POST /trade-api/v2/portfolio/events/orders`, never removed V1 write endpoints. A YES purchase is a YES-side bid; NO is the complementary YES-side ask and may offset an existing opposite position. The UI discloses this. Supported orders are 1–1000 whole contracts, fill-or-kill, primary subaccount only, with a reviewed contract cost plus conservative fee reserve at most 1000 USD. Only verified open markets, known exchange shards and standard quadratic fee models with multiplier 1 are enabled. Other fee models stop at preview.

The reserve bounds the standard taker fee via `0.07 * count * P * (1-P)`, with `P*(1-P) <= 1/4`, plus per-fill micro-dollar rounding and an extra cent for balance alignment. The displayed reserve is part of the reviewed maximum, not a new fee charged by Oasis. The server reloads market, order book, series fees and shard balance before forwarding.

Kalshi signs timestamp + method + path, not the request body. Oasis therefore restricts exact V2 order fields, validates the reviewed intent again, and atomically reserves a signature fingerprint and account/client-order ID in the existing SQLite Durable Object before a single submission. No signing private key is held by the server. Reused signatures or client IDs cannot cause a second forwarding.

Principal-wallet cross-tab locks and Kalshi account journals precede signing/submission. Unknown results survive reloads and block new spending through the existing funding guard. Recovery is read-only, limited to three pages for the original ticker/shard/client ID. No match remains unresolved; there is no automatic resend or balance-only inference. Only matching platform receipts with consistent quantities, price and fee bounds report a fill. This is platform-reported execution evidence, not an independently verified ledger or bank debit.

## Validation scope

Tests use ephemeral fixture keys and fake platform transports only. Real-browser fixtures exercise Ed25519/RSA WebCrypto and UI states; workerd/SQLite checks concurrent replay reservations. Public live probes may read metadata, status and books. They must not import user keys, authenticate real financial accounts, approve or place orders. No real Kalshi credential was supplied during development, so authenticated live account acceptance remains for the user after configuration.
