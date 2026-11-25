import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuChat | AI Document Assistant by Sujit Ram Dhakal",
  description: "Created by Sujit Ram Dhakal. Upload documents and chat with precision using Google Gemini and vector search.",
  authors: [{ name: "Sujit Ram Dhakal" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-white text-[#171717]">
      <body className="min-h-full flex flex-col bg-white text-[#171717] antialiased">
        {children}
      </body>
    </html>
  );
}
