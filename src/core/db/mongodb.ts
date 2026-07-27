import mongoose from "mongoose";
import dns from "dns";

// Force Node's DNS resolver to query servers directly (c-ares) instead of
// going through getaddrinfo()/the OS resolver. On some serverless network
// setups, DNS lookups against the OS resolver stall in a way that never
// returns and never throws. Explicit, fast public resolvers avoid that path.
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const resolveSrv = (hostname: string) =>
  new Promise<dns.SrvRecord[]>((resolve, reject) => {
    dns.resolveSrv(`_mongodb._tcp.${hostname}`, (err, records) => {
      if (err) reject(err);
      else resolve(records);
    });
  });

const resolveTxt = (hostname: string) =>
  new Promise<string[][]>((resolve, reject) => {
    dns.resolveTxt(hostname, (err, records) => {
      if (err) resolve([]); // TXT (used for connection options) is optional
      else resolve(records);
    });
  });

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms (DNS stall)`)), ms);
    }),
  ]);
}

// mongodb+srv:// requires the driver to run a DNS SRV lookup (plus an
// optional TXT lookup for default connection options) BEFORE it can attempt
// any TCP connection at all. That lookup goes through Node's `dns` module,
// which uses libuv's own thread pool — a JS-level `Promise.race` wrapped
// around `mongoose.connect()` does NOT reliably rescue a hang here, because
// the dangling SRV lookup is an outstanding libuv operation, not a promise
// that can simply be abandoned; the event loop can still end up parked
// waiting on it in some environments/Node versions, and the "outer" timeout
// promise's own timer never gets a chance to fire.
//
// The fix: resolve the SRV (and TXT) records ourselves, with our own
// `dns` calls (which we just pointed at fast public resolvers above) and
// our own hard timeout, then hand mongoose a **plain mongodb:// URI** with
// the explicit host list. This skips the driver's internal SRV resolution
// entirely, so there is nothing left that can hang unrecoverably.
async function resolveSrvConnectionString(srvUri: string): Promise<string> {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^@]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) {
    // Not an srv:// URI (or doesn't match the expected shape) — use as-is.
    return srvUri;
  }
  const [, userpass, hostname, rawPath, rawQuery] = match;
  const path = rawPath || "/";
  const query = new URLSearchParams(rawQuery ? rawQuery.slice(1) : "");

  const [srvRecords, txtRecords] = await Promise.all([
    withTimeout(resolveSrv(hostname), 5000, "SRV lookup"),
    withTimeout(resolveTxt(hostname), 5000, "TXT lookup"),
  ]);

  if (!srvRecords.length) {
    throw new Error(`No SRV records found for _mongodb._tcp.${hostname}`);
  }

  // TXT record (if present) carries default query-string options (e.g.
  // replicaSet=..., authSource=admin) — merge them in without overriding
  // anything already explicit in the original URI.
  const txtOptions = new URLSearchParams(txtRecords.flat().join("&"));
  for (const [key, value] of txtOptions) {
    if (!query.has(key)) query.set(key, value);
  }
  if (!query.has("tls") && !query.has("ssl")) query.set("tls", "true");

  const hostList = srvRecords
    .map((r) => `${r.name}:${r.port}`)
    .join(",");

  return `mongodb://${userpass}@${hostList}${path}?${query.toString()}`;
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = global as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cached: MongooseCache = globalWithMongoose.mongooseCache || {
  conn: null,
  promise: null,
};

globalWithMongoose.mongooseCache = cached;

// Hard outer ceiling on the ENTIRE connect attempt, including the initial
// `mongodb+srv://` DNS SRV-record lookup the driver does before it even
// starts server selection. That SRV lookup is NOT covered by
// serverSelectionTimeoutMS — if DNS resolution stalls (which happens
// intermittently between some serverless networks and Atlas), the whole
// connect() call can hang forever with no timeout at all. When that
// happens the platform eventually kills the function with no response,
// which the UI experiences as "the page never loads" and shows up in
// logs as a request with no completed status and no visible error.
// Racing against a plain timer guarantees we always get SOMETHING back.
const CONNECT_CEILING_MS = 9000;

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`MongoDB connection attempt exceeded ${ms}ms (DNS/network stall)`)),
      ms
    );
  });
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Resolve the URI lazily (inside the function, not at module load).
    // A module-level throw breaks `next build`, which imports every route
    // module during "collecting page data" even though the env var is only
    // needed at runtime.
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    cached.promise = (async () => {
      // Pre-resolve mongodb+srv:// to a plain mongodb:// URI with explicit
      // hosts BEFORE handing anything to mongoose, so the driver's own
      // (unrescuable) internal SRV lookup never runs. If this step times out,
      // we get a clean, fast error instead of a silent hang.
      const connectionUri = MONGODB_URI.startsWith("mongodb+srv://")
        ? await resolveSrvConnectionString(MONGODB_URI)
        : MONGODB_URI;

      return Promise.race([
        mongoose.connect(connectionUri, {
          bufferCommands: false,
          // Production pool + timeout settings. The mongoose default
          // serverSelectionTimeoutMS is 30s — when the DB is unreachable every
          // API request hangs for 30 seconds, which the UI experiences as
          // "page frozen on the loading screen". Fail fast instead.
          maxPoolSize: 20,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
          socketTimeoutMS: 45000,
        }),
        timeoutAfter(CONNECT_CEILING_MS),
      ]);
    })();
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Un-poison the cache: without this, one failed connection attempt
    // leaves a permanently-rejected promise cached and every subsequent
    // request fails instantly until the server restarts.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
