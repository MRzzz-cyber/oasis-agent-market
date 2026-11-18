import assert from "node:assert/strict";
import test from "node:test";
import { closeDemoApiServer, createDemoApiServer } from "./server.mjs";

test("serves the research UI and all three procurement decisions", async () => {
  const { server, baseUrl } = await createDemoApiServer({ port: 0 });
  try {
    const page = await fetch(baseUrl + "/research.html");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Research procurement/);
    const result = await fetch(baseUrl + "/research/demo");
    assert.equal(result.status, 200);
    const { network, asset, scenarios } = await result.json();
    assert.equal(network, "eip155:84532");
    assert.equal(asset, "USDC");
    assert.equal(scenarios.purchase.selectedProvider, "atlas");
    assert.equal(scenarios.decline.selectedProvider, null);
    assert.equal(scenarios.policyBlock.evaluations[0].reason, "quote_mismatch");
  } finally {
    await closeDemoApiServer(server);
  }
});
