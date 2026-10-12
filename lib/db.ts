import { MongoClient, Db } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _huddleClient: MongoClient | undefined;
}

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  if (globalThis._huddleClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connected = (globalThis._huddleClient as any).topology?.isConnected?.() ?? false;
    if (!connected) {
      globalThis._huddleClient = undefined;
    }
  }

  if (!globalThis._huddleClient) {
    globalThis._huddleClient = new MongoClient(uri);
    await globalThis._huddleClient.connect();
  }
  return globalThis._huddleClient.db("huddle");
}

export async function closeDb(): Promise<void> {
  if (globalThis._huddleClient) {
    await globalThis._huddleClient.close();
    globalThis._huddleClient = undefined;
  }
}
