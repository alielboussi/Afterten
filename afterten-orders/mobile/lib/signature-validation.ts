export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];

function distance(a: SignaturePoint, b: SignaturePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function validateSignatureStrokes(strokes: SignatureStroke[]): {
  ok: boolean;
  message?: string;
} {
  if (strokes.length === 0) {
    return { ok: false, message: "Sign in the box below." };
  }

  let totalLength = 0;
  let pointCount = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      pointCount += 1;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      if (i > 0) {
        totalLength += distance(stroke[i - 1], p);
      }
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 14 && height < 14) {
    return { ok: false, message: "Signature too small — avoid dots only." };
  }
  if (totalLength < 90) {
    return { ok: false, message: "Please sign with a full stroke, not a short line." };
  }
  if (pointCount < 10) {
    return { ok: false, message: "Signature too short." };
  }

  return { ok: true };
}
