# Architecture

## Product boundary

Oasis has one backend process and one browser frontend. The backend owns the Agent runtime, policy checks, payment signer and audit/ledger events. The browser never signs service payments and never receives wallet secrets.

## Runtime flow

```text
User goal + budget
  -> Strategy Agent
  -> market context
  -> identify evidence gap
  -> discover approved service
  -> receive quote
  -> Policy Engine
  -> reserve budget
  -> x402 payment
  -> Market / Risk analysis
  -> Committee synthesis
  -> final Risk check
  -> user confirmation
  -> simulated order
  -> activity + economic ledger
```

## Module map

| Responsibility | Location |
|---|---|
| Strategy state machine | apps/agent/src/strategy/StrategyAgent.mjs |
| LLM provider adapters | apps/agent/src/strategy/ModelProviders.mjs |
| Market context | apps/agent/src/strategy/MarketContextBuilder.mjs |
| Service planning | apps/agent/src/strategy/ToolPlanner.mjs |
| Policy guard | apps/agent/src/strategy/PolicyPaymentGuard.mjs |
| Market Agent | apps/agent/src/market/MarketResearchAgent.mjs |
| Risk Agent | apps/agent/src/risk/RiskAgent.mjs |
| Simulation executor | apps/agent/src/execution/ExecutionAgent.mjs |
| Deterministic policy | packages/policy/src/index.mjs |
| Base/USDC primitives | packages/evm/src/config.mjs |
| Shared utilities | packages/shared/src/ |
| Single API server | apps/demo-api/src/server.mjs |
| Browser UI | apps/frontend/ |

## Important migration note

The currently runnable Agent and payment client still depend on Hedera/HBAR. The new packages/evm module currently contains Base Sepolia and USDC primitives only. The x402 EVM client/server, USDC Policy migration and settlement ledger are the next implementation steps. Do not treat the target flow as production-ready or testnet-complete yet.

## Design rules

- LLM output is a hypothesis, never permission.
- Policy is deterministic and independent from model output.
- Payment signing is isolated from Agent orchestration.
- Execution Agent only creates simulated orders.
- All money uses integer atomic units.
