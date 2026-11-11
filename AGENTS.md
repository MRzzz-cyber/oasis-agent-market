# Oasis Engineering Rules

Oasis is a Chinese-first AI investment assistant MVP. Keep architecture small and auditable.

- Runtime: Node.js 22, ESM, built-in HTTP server, vanilla HTML/CSS/JS.
- Run: \`npm run dev\`, tests: \`npm test\`.
- Payment: Base Sepolia only, Circle test USDC, x402 v2.
- Remove all Hedera/HBAR/tinybar runtime dependencies. Never reintroduce them.
- Web demo is simulation-only and MUST label fixture data, mock committee votes and non-payments.
- Do not add a web endpoint to spend funds. The x402 wallet is accessible only from explicit local CLI.
- Agent input never controls signer, service destination, payment policy or payout address.
- Policy Engine is deterministic and fail closed. Use canonical USDC atomic-unit integer strings for budget/purchases.
- Quote selection requires exact amount, network, token and recipient matching.
- Payment uncertainty holds budget for reconciliation. Never retry a potentially submitted payment without checking chain state.
- Avoid exposing secrets via browser, logs, tests or Git commits.
- Unit tests must not spend tokens. Live testnet smoke requires explicit user opt-in and isolated funded test wallet.
- A good MVP is a complete, explainable simulated user journey, not a promise of real profitable trading.
