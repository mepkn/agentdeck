import { getRandomValues } from "expo-crypto";

// @noble draws randomness from crypto.getRandomValues, which Hermes doesn't have.
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = getRandomValues;
