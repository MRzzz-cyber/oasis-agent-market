const DAY = 86400;
const SESSION = "__Host-oasis-session";
const FLOW = "__Host-oasis-flow";
const CALLBACK = "/api/auth/google/callback";
const enc = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const hash = async value => base64url(await crypto.subtle.digest("SHA-256", enc.encode(value)));
const cookie = (name, value, seconds) => name + "=" + value + "; Max-Age=" + seconds + "; Path=/; HttpOnly; Secure; SameSite=Lax";
function readCookie(request, name) {
  return (request.headers.get("cookie") || "").split(/;\s*/).find(v => v.startsWith(name + "="))?.slice(name.length + 1) || "";
}
const json = (data, status = 200) => Response.json(data, {status, headers: {"cache-control":"no-store"}});
export const googleMode = env => Boolean(env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET);
function redirect(location, cookies) {
  const headers = new Headers({location, "cache-control":"no-store", "referrer-policy":"no-referrer"});
  for (const item of cookies) headers.append("set-cookie", item);
  return new Response(null, {status:303, headers});
}

// Only the Worker has this binding. Each operation below is synchronous within its object.
export class AccountStore {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS accounts (sub TEXT PRIMARY KEY, active INTEGER DEFAULT 0, tries INTEGER DEFAULT 0, retry_at INTEGER DEFAULT 0)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, sub TEXT NOT NULL, email TEXT NOT NULL, expires INTEGER NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires)");
  }
  async fetch(request) {
    const {op, token, sub, email, matches} = await request.json();
    const now = Date.now();
    if (op === "create") {
      this.sql.exec("DELETE FROM sessions WHERE expires <= ?", now);
      this.sql.exec("INSERT OR IGNORE INTO accounts(sub) VALUES (?)", sub);
      this.sql.exec("INSERT INTO sessions VALUES (?,?,?,?)", token, sub, email, now + 30 * DAY * 1000);
      return json({ok:true});
    }
    if (op === "logout") {
      this.sql.exec("DELETE FROM sessions WHERE token=?", token);
      return json({ok:true});
    }
    const [user] = this.sql.exec("SELECT accounts.*, sessions.email FROM sessions JOIN accounts USING(sub) WHERE token=? AND expires>?", token, now).toArray();
    if (!user) return json({error:"请先使用 Google 登录"}, 401);
    if (op === "activate" && !user.active) {
      if (user.tries >= 5 && user.retry_at > now) return json({error:"尝试次数过多，请在 15 分钟后再试"}, 429);
      if (!matches) {
        const tries = user.retry_at > now ? user.tries + 1 : 1;
        this.sql.exec("UPDATE accounts SET tries=?, retry_at=? WHERE sub=?", tries, now + 900000, user.sub);
        return json({error:"私人体验码不正确"}, 403);
      }
      this.sql.exec("UPDATE accounts SET active=1, tries=0, retry_at=0 WHERE sub=?", user.sub);
      user.active = 1;
    }
    return json({id:user.sub, email:user.email, active:Boolean(user.active)});
  }
}
function db(env, input) {
  const store = env.ACCOUNTS.get(env.ACCOUNTS.idFromName("accounts-v1"));
  return store.fetch("https://internal/account", {method:"POST", body:JSON.stringify(input)});
}
export async function account(request, env, op="session", matches=false) {
  const raw = readCookie(request, SESSION);
  if (!/^[\w-]{43}$/.test(raw)) return json({error:"请先使用 Google 登录"}, 401);
  return db(env, {op, token:await hash(raw), matches});
}
export async function authRoute(request, env, fetchImpl=fetch) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!env.ACCOUNTS || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({error:"Google 登录尚未配置完成"}, 503);
  const callback = url.origin + CALLBACK;
  if (path === "/api/auth/google" && request.method === "GET") {
    const state = random(), verifier = random();
    const params = new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID, redirect_uri:callback, response_type:"code", scope:"openid email", state, code_challenge:await hash(verifier), code_challenge_method:"S256", prompt:"select_account"});
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params, [cookie(FLOW,state+"."+verifier,600)]);
  }
  if (path === CALLBACK && request.method === "GET") {
    const [state, verifier] = readCookie(request,FLOW).split(".");
    const cleared = cookie(FLOW,"",0);
    const failed = () => redirect("/?login=failed", [cleared]);
    if (!state || !verifier || state !== url.searchParams.get("state") || !url.searchParams.get("code")) return failed();
    try {
      const tokens = await fetchImpl("https://oauth2.googleapis.com/token", {method:"POST", body:new URLSearchParams({code:url.searchParams.get("code"), code_verifier:verifier, grant_type:"authorization_code", redirect_uri:callback, client_id:env.GOOGLE_CLIENT_ID, client_secret:env.GOOGLE_CLIENT_SECRET})});
      if (!tokens.ok) return failed();
      const {access_token} = await tokens.json();
      if (!access_token) return failed();
      const profile = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {headers:{authorization:"Bearer "+access_token}});
      if (!profile.ok) return failed();
      const {sub,email,email_verified} = await profile.json();
      if (!sub || !email || email_verified !== true) return failed();
      const raw = random();
      const created = await db(env,{op:"create", token:await hash(raw),sub,email});
      if (!created.ok) return failed();
      return redirect("/?login=ok",[cleared,cookie(SESSION,raw,30*DAY)]);
    } catch { return failed(); }
  }
  if (path === "/api/auth/me" && request.method === "GET") return account(request,env);
  if (request.method !== "POST" || request.headers.get("origin") !== url.origin) return json({error:"请求来源无效"},403);
  if (path === "/api/auth/logout") {
    await account(request,env,"logout");
    return new Response(null,{status:204,headers:{"set-cookie":cookie(SESSION,"",0),"cache-control":"no-store"}});
  }
  if (path === "/api/auth/activate") {
    if (!env.OASIS_DEMO_ACCESS_CODE) return json({error:"管理员尚未设置体验码"},503);
    const input = await request.json().catch(()=>null);
    if (typeof input?.code !== "string" || input.code.length > 1024) return json({error:"请输入体验码"},400);
    const matches = await hash(input.code) === await hash(env.OASIS_DEMO_ACCESS_CODE);
    return account(request,env,"activate",matches);
  }
  return json({error:"接口不存在"},404);
}
