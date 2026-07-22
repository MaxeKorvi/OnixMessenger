import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Onix Messenger",
  description: "Приватные диалоги для своих людей",
  icons: {
    icon: "/onix/assets/onix-favicon.png",
    shortcut: "/onix/assets/onix-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
