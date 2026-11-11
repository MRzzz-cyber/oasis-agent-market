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
  hedera/                Legacy hackathon adapter; migration only
docs/
  technical-stack.md     Technology decisions and boundaries
  roadmap.md             MVP milestones and acceptance criteria
  architecture.md        Current implementation map
  payment-flow.md        Current/target payment flow
```

## Quick start (current legacy demo)

The currently runnable end-to-end demo still uses the original Hedera adapter. The Base Sepolia payment migration is in progress and must not be mistaken for a completed integration.

```bash
pnpm install
HEDERA_PAYMENT_MODE=mock OASIS_MARKET_DATA_MODE=fixture OASIS_LLM_MODE=rule pnpm demo:web
```

Run tests:

```bash
pnpm test
```

## Configuration

Copy .env.example to .env. Do not commit private keys, seed phrases, API keys or funded wallet credentials.

The Base Sepolia variables are target configuration; they are not yet consumed by the legacy payment runtime.

## Development status

- Existing Agent runtime, model adapters, market/risk agents and simulation flow are retained.
- Base Sepolia / USDC integer amount primitives are implemented under `packages/evm`.
- A separate, fail-closed USDC policy and single-process budget reservation ledger is implemented under `packages/policy/src/usdc.mjs`.
- A policy-gated purchase coordinator is implemented under `packages/evm/src/purchase.mjs`. It requires an injected, verified payment transport, and **cannot send a live payment itself**.
- GitHub Actions now runs the test suite on pull requests. The legacy Hedera code stays intact while the Base implementation is migrated.
- Full x402 EVM client/server, durable ledger, existing StrategyAgent integration, and end-to-end Base Sepolia settlement are **still pending**.

See Technical Stack (docs/technical-stack.md) and Roadmap (docs/roadmap.md).

## License

MIT
