export function asString(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value);
  }
  
export function asNumber(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    return undefined;
}