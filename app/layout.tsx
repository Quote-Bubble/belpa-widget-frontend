import type { Metadata } from "next";
import { Geist, Inter, Poppins } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["300", "500", "600"],
  subsets: ["latin"],
});

export const viewport = {
  // The Quote Link is opened from a QR code, so the browser chrome is
  // right next to the page. Left unset it defaults to white/grey and
  // reads as a stray tab rather than the roofer's page.
  themeColor: "#f4f7fb",
  width: "device-width",
  initialScale: 1,
  // Deliberately NOT maximumScale/userScalable — capping zoom on a form
  // people fill in on a phone is an accessibility failure.
};

export const metadata: Metadata = {
  title: "Belpa",
  description: "Instant roof quotes measured from satellite imagery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${inter.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
