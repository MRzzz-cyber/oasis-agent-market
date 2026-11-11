// Run only on a local development machine with an explicit receiving address.
// This is a stand-alone x402 test seller; the main Oasis API stays Node-native.
import { BASE_SEPOLIA } from "../packages/evm/src/config.mjs";

const recipient = process.env.OASIS_TEST_SERVICE_RECIPIENT;
if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
  throw new Error("OASIS_TEST_SERVICE_RECIPIENT must be a valid test merchant wallet");
}
const facilitatorUrl = process.env.OASIS_TEST_FACILITATOR_URL || "https://x402.org/facilitator";
const port = Number(process.env.OASIS_TEST_SERVICE_PORT || "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid test server port");

const [{ default: express }, { paymentMiddleware }, { x402ResourceServer, HTTPFacilitatorClient },
  { ExactEvmScheme }] = await Promise.all([
  import("express"),
  import("@x402/express"),
  import("@x402/core/server"),
  import("@x402/evm/exact/server")
]);
const app = express();
const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitator);
resourceServer.register(BASE_SEPOLIA.network, new ExactEvmScheme());

app.get("/health", (_req, res) => res.json({ ok: true, network: BASE_SEPOLIA.network }));
app.use(paymentMiddleware({
  "GET /market-signal": {
    accepts: [{
      scheme: "exact",
      network: BASE_SEPOLIA.network,
      price: "$0.10",
      payTo: recipient
    }],
    description: "Oasis test market signal",
    mimeType: "application/json"
  }
}, resourceServer));
app.get("/market-signal", (_req, res) => {
  // Demo fixture only; do not display as fresh financial data.
  res.json({
    asset: "ETH",
    mode: "fixture",
    observedAt: "2026-11-11T00:00:00Z",
    signal: "WATCH",
    warning: "Demonstration fixture, not live market data."
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log("Oasis x402 test seller listening on http://127.0.0.1:" + port);
  console.log("Base Sepolia USDC only. This seller accepts test token payments.");
});
