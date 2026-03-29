export function splitHumanName(fullName: string): { firstName: string; lastName: string | null } {
  const cleaned = fullName.replace(/\s+/g, " ").trim();
  if (!cleaned) return { firstName: "Unknown", lastName: null };
  const parts = cleaned.split(" ");
  const firstName = parts[0] ?? "Unknown";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { firstName, lastName };
}

export function whatsappUsernameForSender(sender: string): string {
  const normalized = sender.toLowerCase().trim();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "member";
  const uuid = deterministicUuidFromText(normalized);
  return `${slug}_${uuid}`;
}

function deterministicUuidFromText(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  let h3 = 0x811c9dc5;
  let h4 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = fnv1a(h1, c);
    h2 = fnv1a(h2, c ^ 0x9e37);
    h3 = fnv1a(h3, c ^ 0x7f4a);
    h4 = fnv1a(h4, c ^ 0x85eb);
  }
  const p1 = hex8(h1);
  const p2 = hex8(h2);
  const p3 = hex8(h3);
  const p4 = hex8(h4);
  return `${p1}-${p2.slice(0, 4)}-4${p2.slice(5, 8)}-a${p3.slice(1, 4)}-${p3.slice(4)}${p4}`;
}

function fnv1a(hash: number, c: number): number {
  hash ^= c;
  return Math.imul(hash, 0x01000193) >>> 0;
}

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}
