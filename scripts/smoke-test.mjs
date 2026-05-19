const baseUrl = process.env.PUBLIC_BASE_URL || `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "4000"}`;
const suffix = Date.now();

const results = [];

await record("health", "GET", "/api/health");
await record("ready", "GET", "/api/ready");
const register = await record("register", "POST", "/api/auth/register", {
  name: "Smoke Test",
  email: `smoke-${suffix}@example.com`,
  password: "password123"
});
const login = await record("login", "POST", "/api/auth/login", {
  email: `smoke-${suffix}@example.com`,
  password: "password123"
});
await record("connect", "POST", "/api/connections/connect", {
  method: "ssh-password",
  fields: {
    host: "127.0.0.1",
    port: "22",
    username: "ubuntu",
    password: "password123"
  }
}, login.body?.token);

for (const result of results) {
  const marker = result.ok ? "ok" : "fail";
  console.log(`[${marker}] ${result.name}: ${result.status}`);
}

if (!register.ok || results.some((result) => !result.ok)) {
  console.error("Smoke test failed.");
  process.exit(1);
}

console.log("Smoke test passed.");

async function record(name, method, path, payload, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: payload ? JSON.stringify(payload) : undefined
  });
  const body = await response.json().catch(() => null);
  const result = { name, status: response.status, ok: response.ok, body };
  results.push(result);
  return result;
}
