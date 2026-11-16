# Oasis Engineering Rules

Oasis is a Chinese-first AI investment assistant MVP. Keep architecture small and auditable.

- Runtime: Node.js 22, ESM, built-in HTTP server, vanilla HTML/CSS/JS.
- Run: `npm run dev`, tests: `npm test`.
- Service payments: Base Sepolia only, Circle test USDC, x402 v2.
- Remove all Hedera/HBAR/tinybar runtime dependencies. Never reintroduce them.
- Service-purchase demos remain simulation-only and MUST label fixture data, mock committee votes and non-payments.
- Mainnet ETH spot trading is explicitly user-authorized: browser-only signing and exchange submission after an exact user-reviewed preview. Never let a model approve, sign, submit, choose an account, or increase a trade budget.
- Mainnet API-agent permissions cover account trading beyond the displayed per-order budget. Disclose that scope before approval; keep its one-use key in page memory only and provide revocation guidance.
- On November 16, 2026 the user explicitly requested in-site wallet-confirmed funding. Limit this to native USDC deposits from Arbitrum One to the pinned Hyperliquid Bridge2, same-wallet spot/perp class transfers, withdraw3 to the current wallet on Arbitrum, and an explicitly reviewed switch to independent account mode. Each step needs a separate preview and principal-wallet confirmation. Never use a trading agent key for funding, permit arbitrary recipients, request unlimited token approval, or chain a funding action into a trade automatically.
- Account-mode changes affect the entire account. Require no positions across all perp DEXes, no open orders, and no borrowing or lending supply; never silently change modes.
- Persist pending orders and funding requests before submission. Hold uncertain results for reconciliation, with no automatic retry. A withdrawal acceptance is not proof of bridge completion or receipt.
- Do not add a web endpoint to spend funds. Funding and trading stay in the browser; the x402 wallet is accessible only from explicit local CLI.
- Agent input never controls signer, service destination, payment policy or payout address.
- Policy Engine is deterministic and fail closed. Use canonical USDC atomic-unit integer strings for budget/purchases.
- Quote selection requires exact amount, network, token and recipient matching.
- Payment uncertainty holds budget for reconciliation. Never retry a potentially submitted payment without checking chain state.
- Avoid exposing secrets via browser, logs, tests or Git commits.
- Unit tests must not spend tokens. Live testnet smoke requires explicit user opt-in and isolated funded test wallet. Mainnet signatures, deposits, transfers, withdrawals and order submissions are performed only by the user in their wallet.
- A good MVP is a complete, explainable user journey, not a promise of real profitable trading.
