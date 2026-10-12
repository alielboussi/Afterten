import type { SupabaseClient } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

async function encodeSignatureImage(pngUri: string): Promise<string> {
  const { uri } = await manipulateAsync(pngUri, [], {
    compress: 0.92,
    format: SaveFormat.WEBP,
  });
  return uri;
}

export async function uploadSupervisorDispatchSignature(
  supabase: SupabaseClient,
  outletId: string,
  orderId: string,
  localImageUri: string,
): Promise<{ dbPath: string } | { error: string }> {
  const objectId = Crypto.randomUUID();
  const storageKey = `${outletId}/${orderId}/${objectId}/supervisor-dispatch.webp`;
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
    if (error) return { error: error.message };
  } catch {
    return { error: "Could not upload signature." };
  }

  return { dbPath };
}
