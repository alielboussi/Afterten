import type { SupabaseClient } from "@supabase/supabase-js";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { buildDriverSignatureFileName } from "./signature-file-name";

async function encodeSignatureImage(pngUri: string): Promise<string> {
  const { uri } = await manipulateAsync(pngUri, [], {
    compress: 0.92,
    format: SaveFormat.WEBP,
  });
  return uri;
}

export async function uploadDriverSignature(
  supabase: SupabaseClient,
  outletId: string,
  orderId: string,
  localImageUri: string,
  naming: {
    outletName: string;
    driverName: string;
    supervisorLabel: string;
    orderNumber: string;
  },
): Promise<{ dbPath: string } | { error: string }> {
  const fileName = buildDriverSignatureFileName({
    outletName: naming.outletName,
    driverName: naming.driverName,
    supervisorLabel: naming.supervisorLabel,
    orderNumber: naming.orderNumber,
  });
  const storageKey = `${outletId}/${orderId}/${fileName}`;
  const dbPath = `driver-signatures/${storageKey}`;

  let encodedUri: string;
  try {
    encodedUri = await encodeSignatureImage(localImageUri);
  } catch {
    return { error: "Could not process signature image." };
  }

  try {
    const file = new File(encodedUri);
    const { error } = await supabase.storage.from("driver-signatures").upload(storageKey, file, {
      contentType: "image/webp",
      upsert: true,
    });
    if (error) return { error: error.message };
  } catch {
    return { error: "Could not upload signature." };
  }

  return { dbPath };
}
