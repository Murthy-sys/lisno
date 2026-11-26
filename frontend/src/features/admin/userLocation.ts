const controlCharacters = /[\u0000-\u001F\u007F-\u009F]/u;

export function normalizeUserLocation(value: string): string | null {
  return value.trim() || null;
}

export function userLocationError(value: string): string | undefined {
  if (controlCharacters.test(value)) return "Location cannot contain control characters.";
  if (value.trim().length > 120) return "Enter a location of 120 characters or fewer.";
  return undefined;
}
