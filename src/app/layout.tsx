import type { Metadata } from "next";
import "./globals.css";
import { SpotifyAuthProvider } from "@/context/SpotifyAuthContext";

export const metadata: Metadata = {
  title: "Scuinklezam — El juego definitivo para adivinar canciones con amigos",
  description: "Scuinklezam — El juego definitivo para adivinar canciones con amigos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310B981'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z'/></svg>" />
      </head>
      <body className="font-sans antialiased selection:bg-goblinPrimary selection:text-black">
        <SpotifyAuthProvider>
          {children}
        </SpotifyAuthProvider>
      </body>
    </html>
  );
}
