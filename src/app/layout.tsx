import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sortie",
  description: "Finds jobs that fit your skills, tailors your resume, applies, and watches your inbox.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans md:flex">
        <Nav />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:pt-10">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
