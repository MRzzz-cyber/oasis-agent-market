import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {AccountStore,authRoute} from "./auth.js";
import worker from "./worker.js";

test("Google identity requires activation once, and logout revokes its session", async () => {
  const database = new DatabaseSync(":memory:");
  const sql = {exec(query,...values) {
    const rows = database.prepare(query).all(...values);
    return {toArray:()=>rows};
  }};
  const store = new AccountStore({storage:{sql}});
  const env = {GOOGLE_CLIENT_ID:"client", GOOGLE_CLIENT_SECRET:"secret", OASIS_DEMO_ACCESS_CODE:"invitation",
    ACCOUNTS:{idFromName:x=>x,get:()=>({fetch:(url,init)=>store.fetch(new Request(url,init))})}};
  const base = "https://oasis.test";
  const req = (path, init) => new Request(base+path,init);
  const fakeGoogle = async url => Response.json(url.includes("/token") ? {access_token:"access"} : {sub:"123",email:"user@example.org",email_verified:true});
  async function login() {
    const start = await authRoute(req("/api/auth/google"),env);
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    const flow = start.headers.get("set-cookie").split(";")[0];
    const callback = await authRoute(req("/api/auth/google/callback?code=code&state="+state,{headers:{cookie:flow}}),env,fakeGoogle);
    assert.equal(callback.headers.get("location"),"/?login=ok");
    return callback.headers.getSetCookie().find(v=>v.startsWith("__Host-oasis-session=")).split(";")[0];
  }
  const bad = await authRoute(req("/api/auth/google/callback?code=c&state=wrong"),env,()=>assert.fail());
  assert.equal(bad.headers.get("location"),"/?login=failed");
  const session = await login();
  const getUser = cookie=>authRoute(req("/api/auth/me",{headers:{cookie}}),env);
  const post = (path,code,origin=base)=>req(path,{method:"POST",headers:{cookie:session,origin},body:JSON.stringify({code})});
  assert.equal((await (await getUser(session)).json()).active,false);
  assert.equal((await worker.fetch(post("/api/ai/chat"),env)).status,403);
  assert.equal((await authRoute(post("/api/auth/activate","invitation","https://other.test"),env)).status,403);
  assert.equal((await authRoute(post("/api/auth/activate","wrong"),env)).status,403);
  assert.equal((await (await authRoute(post("/api/auth/activate","invitation"),env)).json()).active,true);
  await authRoute(post("/api/auth/logout"),env);
  assert.equal((await getUser(session)).status,401);
  assert.equal((await (await getUser(await login())).json()).active,true);
  const bypass = req("/api/ai/chat",{method:"POST",headers:{origin:base,"x-oasis-access-code":"invitation"}});
  assert.equal((await worker.fetch(bypass,env)).status,401);
  database.close();
});
