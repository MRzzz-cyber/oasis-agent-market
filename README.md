# Oasis

**Oasis is a budget-bounded AI agent that can discover, purchase and use external services before producing an explainable trading decision.**

MVP target: Base Sepolia + USDC + x402 v2. Agent payments are policy-controlled; trading remains simulation-only.

## Product loop

1. User defines an objective and budget.
2. Strategy Agent identifies missing evidence.
3. Agent discovers an approved service and receives a quote.
4. Policy Engine checks permissions and reserves budget.
5. Agent pays for the service through x402.
6. Market/Risk agents and the model committee analyze the result.
7. Risk Engine reviews the proposal.
8. User confirms; Oasis creates a simulated order only.

## Research procurement preview

Start the demo server, then open `/research.html` to compare three simulated
providers and inspect the buy, decline and blocked-quote scenarios. Quotes use
Base Sepolia USDC atomic units. The simulator does not sign or settle payments.

Open `/research/replay` to fetch and replay Coinbase Exchange ETH-USD daily candles
from January through June 2025. All three strategies predict the same next-day
direction using data available at the decision time. The replay reports accuracy,
purchase count, USDC spend and a modeled utility. The provider scores and the
USDC reward for a correct prediction are simulation assumptions.

## Base Sepolia payment smoke test

Install the isolated smoke runner with `npm install --prefix apps/x402-smoke`.
Set `OASIS_TESTNET_PAYER_KEY` and `OASIS_TESTNET_PAY_TO` in the local environment
or ignored root `.env`. Use a dedicated payer with at least 0.01 Base Sepolia USDC
and a distinct testnet recipient. Run `npm --prefix apps/x402-smoke start` on Node 22.
The runner makes one x402 v2 purchase and checks the resulting ERC-20 receipt.
Each manual invocation can make one new payment.

## Architecture

| Area | Choice |
|---|---|
| Runtime | Node.js 22, ESM |
| Package manager | pnpm |
| Backend | Node native HTTP |
| Frontend | Vanilla HTML/CSS/JavaScript |
| Agent orchestration | Existing StrategyAgent state machine |
| Models | Provider adapters (OpenAI, Claude, Gemini, DeepSeek as configured) |
| Payments | x402 v2 + EVM exact |
| Chain | Base Sepolia (eip155:84532) |
| Asset | USDC (6 decimals) |
| EVM library | viem |
| Tests | node:test |

No microservices, Kubernetes, LangGraph, React migration or production database is required for the first MVP.

## Repository map

```text
apps/
  agent/                 Agent runtime and domain agents
  demo-api/              Single API server and frontend host
  frontend/              Browser UI
  market-signal-api/     Paid market data service
  risk-challenge-api/    Paid risk challenge service
packages/
  evm/                   Base Sepolia and USDC primitives (new)
  policy/                Deterministic budget and permission checks
  shared/                Shared utilities and pricing
docs/
  technical-stack.md     Technology decisions and boundaries
  roadmap.md             MVP milestones and acceptance criteria
  architecture.md        Current implementation map
  payment-flow.md        Current/target payment flow
```

## Quick start

Run `pnpm install --frozen-lockfile`, then `pnpm demo:web`.
Open http://127.0.0.1:4173 for the strategy workspace or
http://127.0.0.1:4173/research.html for the procurement demo.

Run `pnpm test` to validate the strategy, policy, simulations, and replay.

## Configuration

Copy .env.example to .env for the isolated payment smoke test.
Strategy and procurement demos use simulated Base Sepolia USDC payments and local audit records.
The smoke runner uses the official x402 v2 SDK and a dedicated, funded Base Sepolia test wallet.
An actual testnet settlement must be confirmed separately.

## License

MIT
