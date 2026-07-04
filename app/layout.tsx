import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppProviders } from "./providers";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BanterBird | Anonymous Chat - Meet Strangers Online",
    template: "%s · BanterBird",
  },
  description:
    "BanterBird is a fast, anonymous chat platform where you can meet strangers instantly. No registration required, just click and chat with random people worldwide.",
  keywords: ["anonymous chat", "random chat", "meet strangers", "talk to strangers", "omegle alternative", "anonymous messaging", "random video chat", "online chat"],
  authors: [{ name: "BanterBird" }],
  creator: "BanterBird",
  publisher: "BanterBird",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "BanterBird | Anonymous Chat - Meet Strangers Online",
    description: "Fast, anonymous chat platform. Meet strangers instantly without registration. Random matching, real-time messaging.",
    siteName: "BanterBird",
    images: [
      {
        url: "/banterbird-logo.png",
        width: 1200,
        height: 630,
        alt: "BanterBird - Anonymous Chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BanterBird | Anonymous Chat - Meet Strangers Online",
    description: "Fast, anonymous chat platform. Meet strangers instantly without registration.",
    images: ["/banterbird-logo.png"],
    creator: "@banterbird",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: ["/icon.png"],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c121c" },
  ],
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BanterBird",
    url: baseUrl,
    description: "Fast, anonymous chat platform where you can meet strangers instantly without registration.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/match`,
      "query-input": "required",
    },
  };

  return (
    <html lang="en" suppressHydrationWarning className={`${plusJakarta.variable} h-full`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
