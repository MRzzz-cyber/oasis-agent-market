# Oasis Base Sepolia USDC Payment

- Network: \`eip155:84532\`
- Token: Circle test USDC, 6 decimals
- Scheme: x402 v2 exact
- All wallet access stays in explicit local smoke CLI, never the web API.

Flow: Service Registry quote → deterministic Policy → reserve atomic USDC budget → trusted x402 SDK → facilitator → independent RPC receipt verification → settle / reconciliation_required.

The browser demo does not send payments, and its example service quote is not charged to the real ledger.

Consult [the x402 testing guide](base-sepolia-x402-dev.md).

**Caution:** The account/amount/recipient matching is an early-stage testnet safeguard, not a production-grade settlement and replay defense. Production use requires durable reservations, nonce correlation, finality considerations and recovery across restarts.
