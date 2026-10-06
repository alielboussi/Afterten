import type { SupabaseClient } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/**
 * Encodes a captured PNG signature as WebP for upload (Expo has no on-device AVIF encoder).
 */
export async function encodeSignatureImage(pngUri: string): Promise<string> {
  const { uri } = await manipulateAsync(pngUri, [], {
    compress: 0.92,
    format: SaveFormat.WEBP,
  });
  return uri;
}

export async function uploadOutletSignature(
  supabase: SupabaseClient,
  outletId: string,
  localImageUri: string,
): Promise<{ dbPath: string } | { error: string }> {
  const objectId = Crypto.randomUUID();
  const storageKey = `${outletId}/${objectId}/employee.webp`;
  const dbPath = `signatures/${storageKey}`;

  let encodedUri: string;
  try {
    encodedUri = await encodeSignatureImage(localImageUri);
  } catch {
    return { error: "Could not process signature image." };
  }

  try {
    const file = new File(encodedUri);
    const { error } = await supabase.storage.from("signatures").upload(storageKey, file, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error) {
      return { error: error.message };
    }
  } catch {
    return { error: "Could not upload signature." };
  }

  return { dbPath };
}

export async function uploadOffloaderSignature(
  supabase: SupabaseClient,
  outletId: string,
  orderId: string,
  localImageUri: string,
): Promise<{ dbPath: string } | { error: string }> {
  const storageKey = `${outletId}/${orderId}/offloader.webp`;
  const dbPath = `signatures/${storageKey}`;

  let encodedUri: string;
  try {
    encodedUri = await encodeSignatureImage(localImageUri);
  } catch {
    return { error: "Could not process signature image." };
  }

  try {
    const file = new File(encodedUri);
    const { error } = await supabase.storage.from("signatures").upload(storageKey, file, {
      contentType: "image/webp",
      upsert: true,
    });
    if (error) {
      return { error: error.message };
    }
  } catch {
    return { error: "Could not upload signature." };
  }

  return { dbPath };
}
