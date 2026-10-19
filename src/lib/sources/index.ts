import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { smartrecruiters } from "./smartrecruiters";
import type { Provider, Source } from "./types";
import { workday } from "./workday";

export const SOURCES: Record<Provider, Source> = { greenhouse, lever, ashby, smartrecruiters, workday };

export * from "./types";
