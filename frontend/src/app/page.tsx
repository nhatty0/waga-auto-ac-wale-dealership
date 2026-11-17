"use client";

import { Suspense } from "react";
import DealerShowroomView from "@/components/DealerShowroomView";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <DealerShowroomView dealerSlug="ac-wale-cars" />
    </Suspense>
  );
}
