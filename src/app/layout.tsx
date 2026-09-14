import type { Viewport } from "next";
import { siteMetadata } from "@/lib/site-metadata";
import "./globals.css";

export const metadata = siteMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-black text-white">{children}</body>
    </html>
  );
}
