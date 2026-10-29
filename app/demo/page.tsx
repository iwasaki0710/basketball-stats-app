import type { Metadata } from "next";
import Courtvision from "@/components/courtvision";
export const metadata: Metadata = {
  title: "COURTVISION | ログイン不要の体験デモ",
  description:
    "架空の大学バスケットボールチームで、ライブ記録・ショットチャート・戦術分析を体験できます。",
  robots: { index: false, follow: false },
  manifest: "/demo.webmanifest",
};
export default function DemoPage() {
  return <Courtvision demoMode />;
}
