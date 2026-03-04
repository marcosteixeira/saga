import type { Metadata } from "next";
import {
  Pragati_Narrow,
  Rokkitt,
  Barlow_Condensed,
  Share_Tech_Mono,
} from "next/font/google";
import { ProfileLink } from "@/components/profile-link";
import "./globals.css";

const pragatiNarrow = Pragati_Narrow({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-display",
});

const rokkitt = Rokkitt({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-heading",
});

const barlowCondensed = Barlow_Condensed({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-body",
});

const shareTechMono = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://saga.vercel.app"
  ),
  title: "Saga",
  description:
    "AI-powered tabletop RPG — gather your party, let the AI Game Master guide your adventure through dark fantasy realms.",
  openGraph: {
    title: "Saga",
    description:
      "AI-powered tabletop RPG — gather your party, let the AI Game Master guide your adventure.",
    images: ["/images/saga-og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${pragatiNarrow.variable} ${rokkitt.variable} ${barlowCondensed.variable} ${shareTechMono.variable} antialiased`}
      >
        <ProfileLink />
        {children}
      </body>
    </html>
  );
}
