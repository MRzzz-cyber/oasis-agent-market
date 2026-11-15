# Mainnet ETH conversation journey

All OpenRouter models receive the same system instruction: research, choose real USDC budget, confirm the plan, check the selected external wallet's Hyperliquid mainnet spot funds, then confirm the real order on Hyperliquid's official website. Research and cancellation remain available. Quick choices are 10 USDC, 50 USDC and a custom amount. Amount selection is a UI operation rather than another model call.

Oasis does not sign or submit a mainnet order in this version. The official link is fixed to https://app.hyperliquid.xyz/trade. The plan tells the user to connect the displayed same address, choose Spot UETH/USDC instead of ETH perpetuals, enter the budget manually, and check price, size, minimum notional and fees. Opening the link is not an order or fill. There is no automatic budget increase or claim that exactly 10 USDC clears venue minimums.

Funding reads Hyperliquid mainnet spot available USDC only. Chain wallet assets and perpetual withdrawable collateral do not satisfy spot funding. Failed or testnet balances cannot advance the readiness check. Oasis embedded wallets are currently receipt-only and cannot connect to the third-party trading app; this journey requires Rabby, MetaMask, OKX or another external wallet, with official venue deposits. It must not encourage funding an embedded account for an unavailable trading capability.

Old testnet signing and execution remain isolated. Legacy test-budget messages cannot become real-money budgets. No mainnet signer permissions, exchange-submit endpoint or auto-execution were added. Existing local research history remains scoped to each browser origin; the custom domain does not migrate workers.dev storage.
