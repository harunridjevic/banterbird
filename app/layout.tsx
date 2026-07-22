import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppProviders } from "./providers";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BanterBird — Free Anonymous Chat Online (No Signup)",
    template: "%s · BanterBird",
  },
  description:
    "BanterBird is free anonymous chat online with no signup and no download. Start instant 1-on-1 anonymous text chat with random people worldwide.",
  keywords: [
    "banterbird",
    "banterbird.app",
    "banter bird",
    "google ai banterbird",
    "banterbird anonymous chat",
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
    "AI chat practice",
    "anonymous AI chat",
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
  // Per-route canonicals only — do not force "/" site-wide (was causing GSC "alternate canonical").
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://banterbird.app",
    title: "BanterBird — Free Anonymous Chat Online",
    description:
      "Free anonymous chat online — no signup. Instant 1-on-1 anonymous text chat with random people worldwide on BanterBird.",
    siteName: "BanterBird",
    images: [
      {
        url: "/logo_search.png",
        width: 1200,
        height: 630,
        alt: "BanterBird — Anonymous Chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BanterBird — Free Anonymous Chat Online",
    description:
      "Free anonymous chat online — no signup. Instant 1-on-1 anonymous text chat with random people worldwide on BanterBird.",
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
  // Cache-bust icon URLs so Google/crawlers re-fetch after brand updates (v0.12.0).
  // Note: Search Console favicon/logo can still take days–weeks to refresh after recrawl.
  icons: {
    icon: [
      { url: "/favicon.ico?v=0.12.0", sizes: "48x48" },
      { url: "/favicon-96x96.png?v=0.12.0", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg?v=0.12.0", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico?v=0.12.0",
    apple: [
      { url: "/apple-touch-icon.png?v=0.12.0", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest?v=0.12.0",
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
        description:
          "BanterBird is a free anonymous chat platform at banterbird.app — start 1-on-1 text chat instantly with no registration.",
        publisher: {
          "@id": `${baseUrl}/#organization`,
        },
        potentialAction: {
          "@type": "InteractAction",
          target: baseUrl,
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
          // Prefer a square mark for Knowledge Graph; OG image remains logo_search.png
          url: `${baseUrl}/web-app-manifest-512x512.png?v=0.12.0`,
          width: 512,
          height: 512,
        },
        image: `${baseUrl}/logo_search.png?v=0.12.0`,
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
        url: baseUrl,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description:
          "Free anonymous chat online on BanterBird (banterbird.app) with instant matching and no signup required.",
        featureList: [
          "Anonymous chat",
          "Random matching",
          "No registration required",
          "Instant messaging",
          "Interest-based matching",
          "Mobile-friendly",
          "AI practice chat",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is BanterBird?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "BanterBird (banterbird.app) is a free anonymous chat site for instant 1-on-1 text conversations with random people — no signup required.",
            },
          },
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
            name: "How does anonymous chat matching work on BanterBird?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "BanterBird instantly connects you with a random person for 1-on-1 anonymous text chat. You can set preferences and start chatting within seconds.",
            },
          },
          {
            "@type": "Question",
            name: "Is BanterBird the same as banterbird.com?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. This product is BanterBird at banterbird.app — a free anonymous chat app. It is not affiliated with other sites using similar names.",
            },
          },
        ],
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning className={`${plusJakarta.variable} h-full`}>
      <head>
        {/* Google tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-YWHJZBKFLM"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-YWHJZBKFLM');
          `}
        </Script>
        {/* Google AdSense */}
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2521687003085794"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
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
