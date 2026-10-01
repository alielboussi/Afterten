import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
/* Single CSS entry — do not import these from nested layouts (breaks HMR on Windows). */
import "./globals.css";
import "./dashboard/dashboard.css";
import "./dashboard/products-catalog.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "Afterten Portal",
  description: "Afterten outlet orders backoffice",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className={plusJakarta.className}>{children}</body>
    </html>
  );
}
