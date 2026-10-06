export function sanitizeSignatureFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function formatSignatureTimestamp(at: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lusaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(at)
    .replace(/:/g, "-")
    .replace(/\s/g, "");
  return { date, time };
}

export function buildDriverSignatureFileName(input: {
  outletName: string;
  driverName: string;
  supervisorLabel: string;
  orderNumber: string;
  at?: Date;
}): string {
  const at = input.at ?? new Date();
  const { date, time } = formatSignatureTimestamp(at);
  const outlet = sanitizeSignatureFilePart(input.outletName) || "Outlet";
  const driver = sanitizeSignatureFilePart(input.driverName) || "Driver";
  const supervisor = sanitizeSignatureFilePart(input.supervisorLabel) || "Supervisor";
  const order = sanitizeSignatureFilePart(input.orderNumber) || "Order";
  return `${outlet}_${driver}_${supervisor}_${order}_${date}_${time}.webp`;
}
