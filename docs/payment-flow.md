# Payment Flow

## Target: Base Sepolia + USDC

The MVP payment rail is x402 v2 exact on Base Sepolia.

| Field | Value |
|---|---|
| Chain ID | 84532 |
| CAIP-2 network | eip155:84532 |
| Asset | Circle USDC |
| USDC decimals | 6 |
| Base Sepolia USDC | 0x036CbD53842c5426634e7929541eC2318f3dCF7e |
| x402 scheme | exact |
| EVM library | viem |

The token address must be checked against Circle's official contract list before any testnet payment. Testnet USDC has no real-world value.

## Target request lifecycle

1. Agent requests a service quote.
2. Service returns price, network, token, recipient, quote ID and expiry.
3. Agent submits a PurchaseIntent to Policy Engine.
4. Policy checks provider/service allowlists, network, token, recipient, quote expiry, per-call cap and remaining task budget.
5. Budget is reserved atomically.
6. Wallet Signer signs the x402 payment payload using an isolated test wallet.
7. x402 client retries the HTTP request with the protocol payment header.
8. Facilitator verifies and settles the payment.
9. Server verifies the settlement response and transaction receipt.
10. Ledger commits the charge; failures are released or marked for reconciliation.

## Security rules

- Never manually construct x402 payment headers; use the official SDK.
- Agent and LLM never access private keys or signer objects.
- The signer only accepts a short-lived, one-time Policy authorization bound to quote ID, exact amount, network, token and recipient.
- Fail closed on unknown networks/assets, mismatched quotes, expired quotes or facilitator errors.
- Use integer USDC atomic units (6 decimals), never floating point.
- Use idempotency keys to prevent duplicate charges on retries.
- Never use a mainnet wallet in MVP.
- No real trading execution.

## Implementation status

The repository currently contains a Base Sepolia/USDC configuration and integer amount helper in packages/evm. The full x402 EVM client/server and payment settlement path are not yet implemented.

The old Hedera/Blocky402 payment flow remains in packages/hedera only to keep the hackathon demo and regression tests available during migration.

## Official references

- https://github.com/x402-foundation/x402/tree/main/typescript/packages/mechanisms/evm
- https://github.com/x402-foundation/x402
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://docs.base.org/
