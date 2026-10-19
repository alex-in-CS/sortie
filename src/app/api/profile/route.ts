import { Profile } from "@/lib/schema";
import { getProfile, saveProfile } from "@/lib/store";

export function GET() {
  const { value, updatedAt } = getProfile();
  return Response.json({ profile: value, updatedAt });
}

export async function PUT(request: Request) {
  const parsed = Profile.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid profile.", issues: parsed.error.issues }, { status: 400 });
  }
  // Textareas keep blank lines while typing; drop them once saved.
  const clean = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);
  const profile = {
    ...parsed.data,
    experience: parsed.data.experience.map((e) => ({ ...e, bullets: clean(e.bullets) })),
    projects: parsed.data.projects.map((p) => ({ ...p, bullets: clean(p.bullets) })),
  };
  return Response.json({ profile, updatedAt: saveProfile(profile) });
}
