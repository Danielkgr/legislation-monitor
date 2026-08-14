import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Legislation Monitor — Track What's Changing in the Law",
  description:
    "Monitor amendments to Australian federal and Victorian legislation. Get plain-language summaries of what changed and who it affects.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable} h-full`}>
      <body className="min-h-full bg-surface text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
