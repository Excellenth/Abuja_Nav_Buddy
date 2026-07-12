export type ParsedStop = {
  query: string;
  label: string;
  resolvable: boolean;
};

export async function parseItinerary(text: string): Promise<ParsedStop[]> {
  const res = await fetch("/api/plan-itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error || "Couldn't plan that route right now.");
  }
  return (json?.stops as ParsedStop[] | undefined) ?? [];
}
