// Minimal API gateway standing in for Supabase's Kong: one origin, path-routed to the services.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const routes = [
  ["/auth/v1", { host: "127.0.0.1", port: 9999 }],
  ["/rest/v1", { host: "127.0.0.1", port: 3000 }],
  ["/storage/v1", { host: "127.0.0.1", port: 5000 }],
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile, x-upsert, cache-control",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "access-control-expose-headers": "content-range, content-length",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      // Reflect whatever headers the client asks to send (supabase-js adds x-supabase-api-version etc.).
      const requested = req.headers["access-control-request-headers"];
      res.writeHead(204, { ...CORS, ...(requested ? { "access-control-allow-headers": requested } : {}) }).end();
      return;
    }
    const match = routes.find(([prefix]) => req.url.startsWith(prefix));
    if (!match) {
      res.writeHead(404, { ...CORS, "content-type": "application/json" }).end(JSON.stringify({ error: "no route" }));
      return;
    }
    const [prefix, target] = match;
    const upstream = http.request(
      { ...target, method: req.method, path: req.url.slice(prefix.length) || "/", headers: { ...req.headers, host: `${target.host}:${target.port}` } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, ...CORS });
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => res.writeHead(502, CORS).end(String(e)));
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway listening on ${PORT}`));
