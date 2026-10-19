import { Answers } from "@/lib/schema";
import { settingRoute } from "@/lib/setting-route";
import { answersStore } from "@/lib/store";

export const { GET, PUT } = settingRoute("answers", Answers, answersStore);
