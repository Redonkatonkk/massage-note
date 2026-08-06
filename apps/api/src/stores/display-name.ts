export function normalizeDisplayName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function profileDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
}): string | null {
  if (!input.firstName || !input.lastName) return null;
  return `${input.firstName} ${input.lastName}`.trim();
}
