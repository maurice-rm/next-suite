import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "next-suite-app",
    template: "%s | next-suite-app",
  },
  description: "Created with create-next-suite",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
