import { Preferences } from "@/lib/schema";
import { settingRoute } from "@/lib/setting-route";
import { preferencesStore } from "@/lib/store";

export const { GET, PUT } = settingRoute("preferences", Preferences, preferencesStore);
