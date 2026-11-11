import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const TRAKT_CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStates = new Map();
const deviceLogins = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname === "/api/trakt/device/start" && request.method === "POST") {
      await handleDeviceStart(response);
      return;
    }
    if (url.pathname === "/api/trakt/device/poll" && request.method === "POST") {
      await handleDevicePoll(request, response);
      return;
    }
    if (url.pathname === "/api/trakt/login-url" && request.method === "POST") {
      await handleLoginUrl(request, response);
      return;
    }
    if (url.pathname === "/api/trakt/callback" && request.method === "GET") {
      await handleCallback(url, request, response);
      return;
    }
    if (url.pathname === "/api/trakt/refresh" && request.method === "POST") {
      await handleRefresh(request, response);
      return;
    }
    if (url.pathname === "/config.js" && process.env.TRAKT_CLIENT_ID) {
      serveRuntimeConfig(request, response);
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    json(response, error.status || 500, { error: error.publicMessage || error.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Nuvio Trakt Bridge running at http://${host}:${port}/`);
});

async function handleLoginUrl(request, response) {
  const clientId = validatedTraktClientId();
  const body = await readJsonBody(request);
  const returnOrigin = resolveCallbackOrigin(request, body.return_origin);
  const redirectUri = resolveRedirectUri(request, returnOrigin);
  const state = crypto.randomUUID();
  const codeVerifier = createCodeVerifier();
  rememberOauthState(state, returnOrigin, codeVerifier, redirectUri);
  const url = new URL("https://auth.trakt.tv/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  json(response, 200, { url: url.toString(), state, client_id: clientId });
}

async function handleCallback(url, request, response) {
  const clientId = validatedTraktClientId();
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") || "";
  const oauthEntry = consumeOauthState(state);
  const callbackOrigin = resolveCallbackOrigin(request, oauthEntry?.returnOrigin);
  if (!oauthEntry) {
    html(response, callbackHtml({
      source: "trakt-oauth",
      status: "error",
      state,
      client_id: clientId,
      error: "invalid_state",
      error_description: "The Trakt authorization state was missing or expired. Please close this popup and connect again.",
    }, callbackOrigin));
    return;
  }
  if (error || !code) {
    html(response, callbackHtml({
      source: "trakt-oauth",
      status: "error",
      state,
      client_id: clientId,
      error: error || "missing_code",
      error_description: url.searchParams.get("error_description") || "",
    }, callbackOrigin));
    return;
  }

  const traktResponse = await fetch("https://api.trakt.tv/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Nuvio-Trakt-Bridge/1.0",
    },
    body: JSON.stringify({
      code,
      client_id: clientId,
      redirect_uri: oauthEntry.redirectUri,
      grant_type: "authorization_code",
      code_verifier: oauthEntry.codeVerifier,
    }),
  });
  const { payload, text } = await readJsonResponse(traktResponse);
  const tokenError = traktResponse.ok ? null : tokenExchangeError(traktResponse, payload, text);
  if (tokenError) {
    console.warn(`Trakt token exchange failed: ${tokenError.error_description}`);
  }
  html(response, callbackHtml({
    source: "trakt-oauth",
    status: traktResponse.ok ? "success" : "error",
    state,
    client_id: clientId,
    tokens: traktResponse.ok ? payload : undefined,
    error: tokenError?.error,
    error_description: tokenError?.error_description,
  }, callbackOrigin));
}

async function handleDeviceStart(response) {
  const clientId = validatedTraktClientId();
  const started = await postTrakt("/oauth/device/code", { client_id: clientId });
  if (!started.response.ok || !started.payload.device_code || !started.payload.user_code) {
    json(response, started.response.status || 502, {
      error: started.payload.error_description || started.payload.error || cleanResponseText(started.text) || "Trakt did not start device sign-in.",
    });
    return;
  }
  const state = crypto.randomUUID();
  const expiresIn = Number(started.payload.expires_in) || 600;
  deviceLogins.set(state, {
    deviceCode: started.payload.device_code,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  json(response, 200, {
    state,
    user_code: started.payload.user_code,
    verification_url: started.payload.verification_url || "https://trakt.tv/activate",
    expires_in: expiresIn,
    interval: Number(started.payload.interval) || 5,
  });
}

async function handleDevicePoll(request, response) {
  const clientId = validatedTraktClientId();
  const body = await readJsonBody(request);
  const entry = deviceLogins.get(String(body.state || ""));
  if (!entry || entry.expiresAt <= Date.now()) {
    deviceLogins.delete(String(body.state || ""));
    json(response, 400, { error: "The Trakt code expired. Connect again." });
    return;
  }
  const polled = await postTrakt("/oauth/device/token", {
    code: entry.deviceCode,
    client_id: clientId,
  });
  if (polled.response.ok && polled.payload.access_token) {
    deviceLogins.delete(String(body.state || ""));
    json(response, 200, { status: "success", client_id: clientId, tokens: polled.payload });
    return;
  }
  const error = String(polled.payload.error || "").toLowerCase();
  const pending = polled.response.status === 400 || polled.response.status === 429;
  const terminal = error === "expired_token"
    || error === "access_denied"
    || error === "invalid_grant"
    || error === "invalid_client"
    || polled.response.status === 404
    || polled.response.status === 410
    || polled.response.status === 418;
  if (pending && !terminal) {
    json(response, 200, { status: "pending", interval: error === "slow_down" || polled.response.status === 429 ? 5 : 0 });
    return;
  }
  deviceLogins.delete(String(body.state || ""));
  json(response, 400, {
    error: polled.payload.error_description || polled.payload.error || cleanResponseText(polled.text) || `Trakt device check returned HTTP ${polled.response.status}.`,
  });
}

async function postTrakt(path, body) {
  const clientId = body.client_id;
  const response = await fetch(`https://api.trakt.tv${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "User-Agent": "Nuvio-Trakt-Bridge/1.0",
    },
    body: JSON.stringify(body),
  });
  const { payload, text } = await readJsonResponse(response);
  return { response, payload, text };
}

async function handleRefresh(request, response) {
  const clientId = validatedTraktClientId();
  const body = await readJsonBody(request);
  if (!body.refresh_token) {
    json(response, 400, { error: "Missing refresh token" });
    return;
  }
  const traktResponse = await fetch("https://api.trakt.tv/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Nuvio-Trakt-Bridge/1.0",
    },
    body: JSON.stringify({
      refresh_token: body.refresh_token,
      client_id: clientId,
      grant_type: "refresh_token",
    }),
  });
  const text = await traktResponse.text();
  response.writeHead(traktResponse.status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(text || "{}");
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);
  const content = await readFile(filePath);
  response.writeHead(200, { "Content-Type": mime[extname(filePath)] || "application/octet-stream" });
  response.end(content);
}

function callbackHtml(payload, targetOrigin = "*") {
  const jsonPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const serializedOrigin = JSON.stringify(String(targetOrigin || "*"));
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Trakt connected</title></head>
<body>
<script>
const payload = ${jsonPayload};
const targetOrigin = ${serializedOrigin};
try { if (window.opener) window.opener.postMessage(payload, targetOrigin); } catch (error) {}
try { if (window.opener && targetOrigin !== "*") window.opener.postMessage(payload, "*"); } catch (error) {}
try { new BroadcastChannel("nuvio-trakt-bridge.trakt-oauth").postMessage(payload); } catch (error) {}
window.close();
</script>
You can close this window.
</body></html>`;
}

function serveRuntimeConfig(request, response) {
  const origin = resolveCallbackOrigin(request);
  const script = `window.NUVIO_TRAKT_BRIDGE_CONFIG = ${JSON.stringify({
    traktLoginUrlEndpoint: "/api/trakt/login-url",
    traktRefreshEndpoint: "/api/trakt/refresh",
    traktCallbackOrigin: origin === "*" ? "" : origin,
  }, null, 2)};`;
  response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
  response.end(script);
}

function normalizeOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.hostname === "0.0.0.0") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function requestOrigin(request) {
  const host = String(request?.headers?.host || "").trim();
  if (!host || host.startsWith("0.0.0.0")) return "";
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || "http";
  return normalizeOrigin(`${protocol}://${host}`);
}

function resolveCallbackOrigin(request, preferredOrigin = "") {
  return normalizeOrigin(preferredOrigin)
    || normalizeOrigin(process.env.TRAKT_CALLBACK_ORIGIN)
    || requestOrigin(request)
    || "*";
}

function resolveRedirectUri(request, preferred = "") {
  const explicit = callbackUrl(preferred);
  if (explicit) return explicit;
  const fromRequest = callbackUrl(requestOrigin(request));
  if (fromRequest) return fromRequest;
  const configured = String(process.env.TRAKT_REDIRECT_URI || "").trim();
  if (!configured) throw serverSetupError();
  validateRedirectUri(configured);
  return configured;
}

function callbackUrl(value) {
  const text = String(value || "").trim();
  if (!text || text === "*") return "";
  if (text.includes("/api/trakt/callback")) {
    validateRedirectUri(text);
    return text;
  }
  const origin = normalizeOrigin(text);
  if (!origin) return "";
  const redirectUri = `${origin}/api/trakt/callback`;
  validateRedirectUri(redirectUri);
  return redirectUri;
}

function createCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function createCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function validatedTraktClientId() {
  const clientId = String(process.env.TRAKT_CLIENT_ID || "").trim();
  if (!TRAKT_CLIENT_ID_PATTERN.test(clientId)) {
    throw serverSetupError();
  }
  return clientId;
}

function validateRedirectUri(redirectUri) {
  let url;
  try {
    url = new URL(redirectUri);
  } catch {
    throw serverSetupError();
  }
  if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname) return;
  throw serverSetupError();
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return { payload: {}, text: "" };
  }
  try {
    return { payload: JSON.parse(text), text };
  } catch {
    return { payload: {}, text };
  }
}

function tokenExchangeError(response, payload, text) {
  const requestId = response.headers.get("x-request-id");
  const detail = payload.error_description
    || payload.message
    || payload.error
    || cleanResponseText(text)
    || response.statusText
    || "Trakt did not return a readable error body.";
  const suffix = requestId ? ` Trakt request id: ${requestId}.` : "";
  return {
    error: payload.error || "trakt_token_exchange_failed",
    error_description: `Trakt token exchange failed with HTTP ${response.status}: ${detail}.${suffix}`,
  };
}

function cleanResponseText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function serverSetupError() {
  const error = new Error("Trakt sign-in is not configured on this server.");
  error.status = 503;
  error.publicMessage = "Trakt sign-in is not configured on this server yet. The site owner needs to configure the bridge OAuth app server-side; users should only have to press Connect Trakt.";
  return error;
}

function rememberOauthState(state, returnOrigin = "", codeVerifier = "", redirectUri = "") {
  cleanupOauthStates();
  oauthStates.set(state, {
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    returnOrigin: normalizeOrigin(returnOrigin),
    codeVerifier,
    redirectUri,
  });
}

function consumeOauthState(state) {
  cleanupOauthStates();
  if (!state || !oauthStates.has(state)) {
    return null;
  }
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  return entry;
}

function cleanupOauthStates() {
  const now = Date.now();
  for (const [state, entry] of oauthStates.entries()) {
    if (entry.expiresAt <= now) {
      oauthStates.delete(state);
    }
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function html(response, content) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(content);
}
