import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ThemeSync } from "@/components/ThemeSync";

export const metadata: Metadata = {
  title: { default: "InkSpace — Smart digital notebook", template: "%s · InkSpace" },
  description:
    "Draw, write, type and calculate in one digital notebook. Handwriting tools, formulas, graphing and export — all offline in your browser.",
  applicationName: "InkSpace"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1013" }
  ]
};

const themeInit = `try{var raw=localStorage.getItem("inkspace-prefs-v1");var theme=null;if(raw){var parsed=JSON.parse(raw);theme=parsed&&parsed.state?parsed.state.theme:null}var dark=theme==="dark"||((theme==="system"||!theme)&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
