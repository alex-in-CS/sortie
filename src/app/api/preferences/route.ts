import { Preferences } from "@/lib/schema";
import { getPreferences, savePreferences } from "@/lib/store";

export function GET() {
  const { value, updatedAt } = getPreferences();
  return Response.json({ preferences: value, updatedAt });
}

export async function PUT(request: Request) {
  const parsed = Preferences.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid preferences.", issues: parsed.error.issues }, { status: 400 });
  }
  return Response.json({ preferences: parsed.data, updatedAt: savePreferences(parsed.data) });
}
