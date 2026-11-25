import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gate pass check | AC WALE MARKET",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
