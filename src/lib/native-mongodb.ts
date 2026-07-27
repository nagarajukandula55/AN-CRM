import mongoose, {
  Connection,
} from "mongoose";

type Cache = {
  conn: Connection | null;
  promise: Promise<Connection> | null;
};

const globalWithMongoose =
  global as typeof global & {
    nativeMongooseCache?: Cache;
  };

const cached =
  globalWithMongoose.nativeMongooseCache || {
    conn: null,
    promise: null,
  };

globalWithMongoose.nativeMongooseCache =
  cached;

// Same hard ceiling as connectDB() in ./mongodb.ts — without this, a stalled
// connection attempt (e.g. a DNS SRV lookup that never resolves) hangs the
// calling request forever with no error and no response. That silent-hang
// symptom was exactly what was hitting /api/auth/login before mongodb.ts
// got this same fix; this file had the identical gap.
const CONNECT_CEILING_MS = 9000;

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Native MongoDB connection attempt exceeded ${ms}ms (DNS/network stall)`)),
      ms
    );
  });
}

export async function connectNativeDB(): Promise<Connection> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    // Resolve the URI lazily (inside the function, not at module load). A
    // module-level throw breaks `next build`, which imports every route
    // module during "collecting page data" even though the env var is only
    // needed at runtime — this was the same bug already fixed in ./mongodb.ts.
    const rawUri = process.env.NATIVE_MONGODB_URI;
    if (!rawUri) {
      throw new Error("NATIVE_MONGODB_URI is not defined in environment variables");
    }

    cached.promise = Promise.race([
      mongoose
        .createConnection(rawUri, {
          dbName: "native",
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
        })
        .asPromise(),
      timeoutAfter(CONNECT_CEILING_MS),
    ]);
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
