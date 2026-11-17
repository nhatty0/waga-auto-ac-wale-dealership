import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import { CompareProvider } from "@/context/CompareContext";
import InstallAppBanner from "@/components/InstallAppBanner";

export const viewport: Viewport = {
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "AC WALE MARKET | ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ",
  description: "AC WALE MARKET - Addis Ababa Premier Digital Showroom, Vehicle Sales & Car Rental Center (ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ)",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AC WALE MARKET",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AC WALE MARKET" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="bg-black antialiased" suppressHydrationWarning>
        <LanguageProvider>
          <CompareProvider>
            {children}
            <InstallAppBanner />
          </CompareProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
