# Mainnet ETH conversation and funding journey

The conversation opens the native UETH/USDC spot order card. Wallet selection, budget, quote preview, principal-wallet API-agent approval and final order confirmation are separate user actions. The browser submits one IOC order, journals it before submission, and reconciles uncertain outcomes without resubmission. Amounts are exact decimal strings; a 10 USDC choice is not a guarantee of meeting venue minimums, and budgets are never increased automatically.

## Funding in Oasis

The order card has a `资金管理 · 入金 / 划转 / 提款` button. Insufficient funds or unsupported account mode also opens this panel. There is no mandatory handoff to the Hyperliquid website.

- Read the selected wallet's Hyperliquid spot balance, perp withdrawable balance and account mode. These are different from chain-wallet assets.
- Deposit native Circle USDC on Arbitrum One to pinned Bridge2 `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7`. This entry point uses an Oasis product floor of 10 USDC, validates wallet/network/balance/bridge code, estimates gas, and sends an exact ERC20 transfer with no token approval. Network fee confirmation belongs to the wallet. Bridging does not automatically move funds into spot or buy ETH.
- Transfer an exact USDC amount between the selected wallet's own standard perp and spot accounts with `usdClassTransfer`. No arbitrary recipient or subaccount is accepted.
- Request `withdraw3` from the perp withdrawable balance to the selected wallet itself on Arbitrum. If funds are in spot, the user must separately review the spot-to-perp transfer first. Protocol fees reduce net receipt; acceptance and ledger evidence are not proof of destination-chain arrival.
- For unified/portfolio accounts, provide an explicit preview for setting `userSetAbstraction` to `disabled`. This changes the whole account, not just Oasis. Refuse while any perp DEX has positions or orders, while borrowing/lending supply exists, or when checks fail. Recheck before submitting. Never switch automatically or create a new wallet.

Each operation needs its own 60-second preview, checkbox and wallet confirmation. Principal wallet signatures are bound to the full EIP712 domain and exact amount, direction, user and network; temporary trading-agent keys cannot fund or withdraw. Embedded wallets keep the existing Privy IDs, JWT identity and keys. Unsupported accounts/chain changes fail closed.

Funding and order submission use the same cross-tab lock. Pending funding is durably stored before submission; uncertain outcomes block further funding/trading. No signatures or secrets are persisted. Accepted requests are one-use. A known deposit hash is checked against its Arbitrum receipt and exact native-USDC Transfer log before marking the chain transaction confirmed. Hyperliquid credit still requires a balance refresh. Withdrawals are matched by original nonce in the account ledger. An uncertain class transfer with no unambiguous response remains held for manual investigation; never clear it based only on a balance difference.

## Validation boundaries

Run `npm test`, `npm run build:wallet` and the Worker bundle check in CI. Tests use fixtures and do not send funded transactions. A passing CI run is not evidence of a real mainnet deposit, withdrawal or fill. Deployment status and wallet UX still need verification in the user's browser.

Reference implementation: Hyperliquid official Python SDK `hyperliquid/exchange.py` and `hyperliquid/utils/signing.py`; bridge address cross-check: MetaMask's Hyperliquid bridge constants. Old testnet demos and per-origin local research history remain separate.
