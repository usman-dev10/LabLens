import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LabLens — Lab results, made human",
  description:
    "An educational guide to help you understand laboratory results in plain language. Not a diagnosis or treatment tool.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
