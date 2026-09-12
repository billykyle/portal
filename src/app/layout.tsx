import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Client Portal — Billy Kyle",
  description: "Private file delivery for Atmos Imagery / Billy Kyle clients.",
  applicationName: "Billy Kyle Client Portal",
  appleWebApp: {
    capable: true,
    title: "Client Portal",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-black text-white">{children}</body>
    </html>
  );
}
