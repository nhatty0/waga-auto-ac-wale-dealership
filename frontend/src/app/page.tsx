"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DealerShowroomView from "@/components/DealerShowroomView";
import SaaSPlatformLanding from "@/components/SaaSPlatformLanding";

function RootPageRouter() {
  const searchParams = useSearchParams();
  const dealer = searchParams?.get("dealer");

  // IF dealer IS PRESENT (e.g. /?dealer=showroom-xyz):
  // Render ONLY the Dealership Showroom component.
  // Do NOT render the 3D interactive car, SaaS sales copy, or platform landing sections here!
  if (dealer) {
    return <DealerShowroomView dealerSlug={dealer} />;
  }

  // IF dealer IS NOT PRESENT (clean root / on Waga Dealership Hub):
  // Render EXCLUSIVELY the standalone SaaS Platform Landing Page.
  // Do NOT render any dealer's vehicle search bar, filter pills, or inventory grid on this page.
  return <SaaSPlatformLanding />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <RootPageRouter />
    </Suspense>
  );
}
