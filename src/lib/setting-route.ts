import "server-only";
import type * as z from "zod";

type Store<T> = { get(): { value: T; updatedAt: string | null }; save(value: T): string };

// GET/PUT handlers for a single-document setting, responding as { [key], updatedAt }.
export function settingRoute<S extends z.ZodType>(key: string, schema: S, store: Store<z.infer<S>>) {
  return {
    GET() {
      const { value, updatedAt } = store.get();
      return Response.json({ [key]: value, updatedAt });
    },
    async PUT(request: Request) {
      const parsed = schema.safeParse(await request.json());
      if (!parsed.success) {
        return Response.json({ error: `Invalid ${key}.`, issues: parsed.error.issues }, { status: 400 });
      }
      return Response.json({ [key]: parsed.data, updatedAt: store.save(parsed.data) });
    },
  };
}
