# Oasis architecture

## Request and payment flow

1. The user approves a strategy charter with a market, risk limits, and research budget.
2. The agent selects a service based on price, relevance, and remaining budget.
3. The x402-gated service responds with HTTP 402 payment requirements.
4. The agent signs a Hedera HBAR payment intent.
5. A facilitator verifies and settles the payment.
6. The service returns its market signal or risk challenge.
7. The decision engine produces a trade or no-trade recommendation.
8. Oasis stores the payment transaction, strategy version, and decision summary in its audit trail; HCS is the intended immutable evidence layer.

## Components

- **Web app:** charter setup, budget visibility, payment status, decision replay.
- **Agent:** policy enforcement, service selection, x402 client, recommendation orchestration.
- **Market signal service:** paid market evidence API.
- **Risk challenge service:** paid independent counterargument API.
- **Hedera:** HBAR settlement through x402; HCS audit records.

## Non-negotiable safeguards

- The agent cannot change the user-set budget.
- The agent cannot expand position size, daily loss limit, or asset whitelist.
- The MVP does not submit real trades.
- No-trade is a valid, successful recommendation.

## First integration

Start from Hedera's x402 inference pay-per-request proof of concept, then replace its paid inference route with the Oasis market-signal route.

- https://github.com/hedera-dev/x402-inference-pay-per-request-poc
