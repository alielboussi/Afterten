import type { SupabaseClient } from "@supabase/supabase-js";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { encodeSignatureImage } from "./signature-upload";

function returnsDbPath(outletId: string, returnId: string, fileName: string): string {
  return `returns/${outletId}/${returnId}/${fileName}`;
}

export async function uploadReturnPhoto(
  supabase: SupabaseClient,
  outletId: string,
  returnId: string,
  localImageUri: string,
): Promise<{ dbPath: string } | { error: string }> {
  const storageKey = `${outletId}/${returnId}/photo.webp`;
  const dbPath = returnsDbPath(outletId, returnId, "photo.webp");

  let encodedUri: string;
  try {
    const { uri } = await manipulateAsync(localImageUri, [{ resize: { width: 1600 } }], {
      compress: 0.85,
      format: SaveFormat.WEBP,
    });
    encodedUri = uri;
  } catch {
    return { error: "Could not process return photo." };
  }

  try {
    const file = new File(encodedUri);
    const { error } = await supabase.storage.from("returns").upload(storageKey, file, {
      contentType: "image/webp",
      upsert: true,
    });
    if (error) return { error: error.message };
  } catch {
    return { error: "Could not upload return photo." };
  }

  return { dbPath };
}

export async function uploadReturnSignature(
  supabase: SupabaseClient,
  outletId: string,
  returnId: string,
  localPngUri: string,
): Promise<{ dbPath: string } | { error: string }> {
  const storageKey = `${outletId}/${returnId}/employee.webp`;
  const dbPath = returnsDbPath(outletId, returnId, "employee.webp");

  let encodedUri: string;
  try {
    encodedUri = await encodeSignatureImage(localPngUri);
  } catch {
    return { error: "Could not process signature image." };
  }

  try {
    const file = new File(encodedUri);
    const { error } = await supabase.storage.from("returns").upload(storageKey, file, {
      contentType: "image/webp",
      upsert: true,
    });
    if (error) return { error: error.message };
  } catch {
    return { error: "Could not upload signature." };
  }

  return { dbPath };
}
