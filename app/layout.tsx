import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOXi 2.0 | VOX Cinemas",
  description: "A bilingual conversational cinema booking experience powered by live VOX and Vista APIs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
