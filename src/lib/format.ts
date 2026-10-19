// A fixed locale so server-rendered dates match what the browser hydrates.
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

const count = new Intl.NumberFormat("en-GB");
export const formatCount = (n: number | null | undefined) => count.format(n ?? 0);
