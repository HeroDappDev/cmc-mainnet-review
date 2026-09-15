import "./globals.css";
import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CMC - Commodity Markets Capital",
  description: "Local community-token launch preview paired with commodity quote coins.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=cmc-green-2", sizes: "16x16 32x32 48x48" },
      { url: "/cmc-icon-32.png?v=cmc-green-2", type: "image/png", sizes: "32x32" },
      { url: "/cmc-icon-192.png?v=cmc-green-2", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico?v=cmc-green-2",
    apple: [{ url: "/cmc-icon-180.png?v=cmc-green-2", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased min-h-screen flex flex-col dark`} suppressHydrationWarning>
        <Providers>
          <Navbar />
          <main className="flex-1 w-full relative z-10 flex flex-col">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
