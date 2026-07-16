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
    default: "BanterBird - Anonymous Chat Online Free",
    template: "%s · BanterBird",
  },
  description:
    "Free anonymous chat online — no signup. Instant 1-on-1 anonymous text chat with random people worldwide on BanterBird.",
  keywords: [
    "anonymous chat",
    "anonymous chat online",
    "free anonymous chat",
    "anonymous text chat",
    "chat anonymously",
    "anonymous messaging",
    "random anonymous chat",
    "online anonymous chat",
    "instant anonymous chat",
    "anonymous chat no registration",
    "chat without account",
    "omegle alternative",
    "random text chat",
    "1 on 1 anonymous chat",
    "private anonymous chat",
    "anonymous chat app",
    "free random chat",
    "chat with random people",
    "anonymous social chat",
    "no signup chat",
  ],
  authors: [{ name: "BanterBird" }],
  creator: "BanterBird",
  publisher: "BanterBird",
  applicationName: "BanterBird",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "BanterBird - Anonymous Chat Online Free",
    description:
      "Free anonymous chat online — no signup. Instant 1-on-1 anonymous text chat with random people worldwide.",
    siteName: "BanterBird",
    images: [
      {
        url: "/logo_search.png",
        width: 1200,
        height: 630,
        alt: "BanterBird - Anonymous Chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BanterBird - Anonymous Chat Online Free",
    description:
      "Free anonymous chat online — no signup. Instant 1-on-1 anonymous text chat with random people worldwide.",
    images: ["/logo_search.png"],
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
    icon: [
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BanterBird",
  },
  category: "social",
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        url: baseUrl,
        name: "BanterBird",
        description: "Free anonymous chat platform — start 1-on-1 text chat instantly with no registration.",
        publisher: {
          "@id": `${baseUrl}/#organization`,
        },
        potentialAction: {
          "@type": "InteractAction",
          target: `${baseUrl}/match`,
          name: "Start Anonymous Chat",
        },
      },
      {
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        name: "BanterBird",
        url: baseUrl,
        logo: {
          "@type": "ImageObject",
          url: `${baseUrl}/logo_search.png`,
          width: 1200,
          height: 630,
        },
        sameAs: [
          "https://twitter.com/banterbird",
          "https://github.com/banterbird",
        ],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${baseUrl}/#software`,
        name: "BanterBird",
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description: "Free anonymous chat online with instant matching and no signup required.",
        featureList: [
          "Anonymous chat",
          "Random matching",
          "No registration required",
          "Instant messaging",
          "Interest-based matching",
          "Mobile-friendly",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Is BanterBird anonymous?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, BanterBird is completely anonymous. No registration or personal information is required to chat.",
            },
          },
          {
            "@type": "Question",
            name: "Is BanterBird free to use?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, BanterBird is completely free to use with no hidden fees or subscriptions.",
            },
          },
          {
            "@type": "Question",
            name: "How does anonymous chat matching work?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "BanterBird instantly connects you with a random person for 1-on-1 anonymous text chat. You can set preferences and start chatting within seconds.",
            },
          },
        ],
      },
    ],
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
