# Polymarket-first experience

Current scope: Polymarket only. Default Chinese with the existing upper-right English switch.

- Homepage: a short conversational prompt, interest shortcuts, six real market cards, topic search and shuffle. Read-only market refresh runs every 60 seconds while visible.
- Selecting a result opens the purchase card directly. No cross-platform quotes or venue selection.
- Review the pUSD budget, Polygon network, maximum price and minimum shares. Balance and shortfall appear in the same card. Account and fee details remain expandable.
- Insufficient funds: expand the controlled Deposit Wallet address / QR, transfer Polygon pUSD, then refresh. Refresh never submits a purchase. Arbitrum USDC bridging/conversion remains unavailable.
- Connecting may require authentication and creation/restoration of a platform Deposit Wallet. The existing Oasis principal wallet and identity are retained.
- Purchase requires explicit review and wallet confirmation. Exact allowances and FOK order policy are unchanged. Pending/unknown results retain the original journal and block further spending; recovery is read-only.

## Retired Kalshi entry points

Production Worker passes `readOnly:true` to the legacy service. New previews and orders return 410 before forwarding. Public search only requests Polymarket; compare and public Kalshi quote routes return 410. Legacy private order/fill reads remain for reconciliation and do not resend orders. Existing journal guards and auth tables are retained. The legacy module's isolated fixture tests remain useful for records/recovery; they do not enable production orders.

## Acceptance

Run `npm test`, wallet and Worker builds, bilingual desktop/mobile fixtures, direct discovery-to-purchase fixtures, and purchase success/shortfall/cancel/pending/unknown fixtures. All signatures and fills in UI tests are synthetic. Public production checks verify the release marker, Polymarket-only results, disabled Kalshi trading and purchase configuration; no real trade is performed.
