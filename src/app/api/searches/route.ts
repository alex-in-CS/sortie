import { Searches } from "@/lib/schema";
import { settingRoute } from "@/lib/setting-route";
import { searchesStore } from "@/lib/store";

export const { GET, PUT } = settingRoute("searches", Searches, searchesStore);
