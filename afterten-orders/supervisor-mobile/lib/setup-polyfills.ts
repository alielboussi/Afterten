/**
 * Supabase PKCE needs crypto.getRandomValues and crypto.subtle.digest (SHA-256).
 * Must load before any Supabase client is created.
 */
import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import { polyfillWebCrypto } from "expo-standard-web-crypto";
import webCrypto from "expo-standard-web-crypto";
import * as ExpoCrypto from "expo-crypto";

polyfillWebCrypto();

const root = globalThis as typeof globalThis & { crypto?: Crypto };

if (!root.crypto) {
  root.crypto = webCrypto as Crypto;
}

if (!root.crypto.subtle) {
  Object.defineProperty(root.crypto, "subtle", {
    configurable: true,
    enumerable: true,
    value: {
      async digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
        const name =
          typeof algorithm === "string" ? algorithm : (algorithm as Algorithm).name;
        if (name !== "SHA-256") {
          throw new Error(`Unsupported digest algorithm: ${name}`);
        }
        const bytes =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes);
      },
    },
  });
}
