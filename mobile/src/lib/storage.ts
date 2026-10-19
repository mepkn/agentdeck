import * as SecureStore from "expo-secure-store";
import { newIdentity, type Identity } from "@/lib/crypto";
import type { Mac } from "@/lib/pairing";

// Keys stay in the Android keystore-backed secure store.

async function read<T>(key: string): Promise<T | null> {
  const s = await SecureStore.getItemAsync(key);
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export async function loadIdentity(): Promise<Identity> {
  const saved = await read<Identity>("identity");
  if (saved?.sign && saved.box) return saved;
  const id = newIdentity();
  await SecureStore.setItemAsync("identity", JSON.stringify(id));
  return id;
}

export const loadMac = () => read<Mac>("mac");

export async function saveMac(mac: Mac | null) {
  if (mac) await SecureStore.setItemAsync("mac", JSON.stringify(mac));
  else await SecureStore.deleteItemAsync("mac");
}
