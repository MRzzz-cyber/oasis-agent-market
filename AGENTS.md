# AGENTS.md

## Project goal

Oasis is a budget-bounded AI agent that purchases approved data/research services through x402 and produces explainable trading decisions. The MVP target is Base Sepolia + USDC. Trading execution is simulation-only.

## Simplest approved stack

- Node.js 22 LTS, ESM, pnpm.
- Node native HTTP backend; keep one deployable API process.
- Existing Vanilla HTML/CSS/JS frontend.
- Existing StrategyAgent state machine; do not add LangGraph.
- x402 v2 EVM + viem for Base Sepolia payments.
- node:test for tests.
- Do not add React, Next.js, Express, Fastify, ORM, database, Redis, queues, microservices or Kubernetes without a concrete demonstrated need.

## Repository map

- apps/agent/: Strategy, Market, Risk and Execution agents.
- apps/demo-api/: single HTTP API and frontend host.
- apps/frontend/: UI.
- apps/market-signal-api/, apps/risk-challenge-api/: paid service handlers used by the demo.
- packages/policy/: deterministic permission and budget engine.
- packages/evm/: Base Sepolia, USDC and x402 EVM payment adapter.
- packages/shared/: shared utilities and pricing.
- packages/hedera/: legacy hackathon implementation. Do not add new product features here.

## Non-negotiable product and security rules

1. Agent/LLM may propose a PurchaseIntent but must never change its own policy.
2. Only Policy Engine can authorize a payment.
3. Validate chain, token contract, recipient, service/provider allowlists, quote expiry, per-payment cap and task budget.
4. Store USDC amounts as BigInt or integer strings in 6-decimal atomic units. Never use floating point for money.
5. Reserve budget before signing; support idempotency and safe release/reconciliation on failures.
6. Private keys remain server-side and never enter model context, browser code, logs or Git.
7. Fail closed on missing policy, invalid quote, unsupported network/token or facilitator errors.
8. Keep all trading execution simulation-only. No mainnet and no real exchange orders.
9. Do not claim Base payment is implemented until a Base Sepolia end-to-end test passes.
10. Preserve old Hedera tests until the migration is complete.

## Workflow

- Inspect existing modules before adding new abstractions.
- Prefer small changes and existing dependency-free JavaScript patterns.
- Add node:test coverage for every new policy/payment behavior.
- Run pnpm test before finishing.
- Never edit generated lockfiles by hand. Update them with pnpm when dependencies change.
- Keep .env.example free of real credentials.

## Completion report

Always report changed files, commands/tests run, actual results, unverified items, and payment network/asset. Distinguish mocked tests from real testnet settlement.
