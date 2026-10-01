export function portalDisplayName(alias: string | null | undefined, email: string | null | undefined) {
  const trimmed = alias?.trim();
  if (trimmed) return trimmed;
  if (email) return email;
  return "User";
}
