# Oasis

> A budget-governed trading agent that pays for market data and risk intelligence via x402 on Hedera.

Oasis is an ETHOnline 2026 hackathon project. A user defines a strategy charter: market, risk limits, research budget, and execution permissions. The agent can purchase market signals and independent risk reviews per request, but cannot exceed user-set limits.

## Core loop

1. User defines a strategy charter and HBAR research budget.
2. Oasis discovers a paid market-data or risk-review service.
3. The service returns HTTP 402; the agent pays via x402 on Hedera testnet.
4. The service returns evidence; the agent recommends trade or no-trade.
5. Oasis records payment and decision summary for audit.
6. MVP simulates execution only; it is not investment advice.

## Why Hedera

- x402 micropayments for per-decision data and review.
- Budget governance keeps agent autonomy constrained.
- HCS provides a tamper-resistant record of payment, strategy version, and outcome.

## MVP scope

- ETH market only; one breakout decision scenario.
- Two x402-gated services: market-signal and risk-challenge.
- Hedera testnet, HBAR payment, Blocky402 facilitator.
- Decision replay and simulated execution.

## Repository structure

- apps/web — user interface and decision replay.
- apps/agent — strategy charter, service selection, payment orchestration.
- services/market-signal — x402-gated market signal API.
- services/risk-challenge — x402-gated independent risk review API.
- docs — product, architecture, research, and submission materials.

## Development status

Planning and technical validation. First milestone: a repeatable Hedera testnet x402 payment from the agent to a gated service.

## AI-assisted development disclosure

AI tools may assist with planning, documentation, and implementation. Before submission, this repository will document specific tools used, affected files, and human review performed, as ETHOnline requires.

## References

- [ETHOnline 2026 Prize Brief](https://ethglobal.com/events/ethonline2026/prizes)
- [Hedera x402 payment standard](https://hedera.com/blog/hedera-and-the-x402-payment-standard/)
- [Hedera x402 inference POC](https://github.com/hedera-dev/x402-inference-pay-per-request-poc)
- [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js)
