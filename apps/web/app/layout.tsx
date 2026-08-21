import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foxglade",
  description: "Walled-village arena treasure hunt with a growing fox companion.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Without this, iOS Safari never extends the page under the notch/home
  // indicator, so every `env(safe-area-inset-*)` call already in the HUD
  // (MobileControls, Minimap, WalletButton) resolves to 0px — the CSS is
  // correct, it just never receives a non-zero value to work with.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="game-root">{children}</div>
      </body>
    </html>
  );
}
