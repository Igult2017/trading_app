import IORedis from "ioredis";

let _client: IORedis | null = null;

if (process.env.REDIS_URL) {
  _client = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  _client.on("error",   (err) => console.warn("[Redis] error:", err.message));
  _client.on("connect", ()    => console.log("[Redis] connected"));
  console.log("[Redis] client created — connecting to", process.env.REDIS_URL.replace(/:\/\/.*@/, "://***@"));
} else {
  console.warn("[Redis] REDIS_URL not set — falling back to in-memory cache (not suitable for multi-worker)");
}

export const redis = _client;
