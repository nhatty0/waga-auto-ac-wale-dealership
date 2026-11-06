import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import DealerShowroomView from "@/components/DealerShowroomView";
import { resolveImageUrl } from "@/lib/images";
import { Dealership, Vehicle } from "@/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const RESERVED_SLUGS = new Set([
  "admin",
  "superadmin",
  "vehicles",
  "api",
  "login",
  "static",
  "uploads",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "_next",
]);

async function fetchDealership(slug: string): Promise<Dealership | null> {
  const backendUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";

  try {
    const res = await fetch(`${backendUrl}/api/public/dealerships/${slug}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return null;
    }

    const data: Dealership = await res.json();
    if (data.is_active === false) {
      return null;
    }
    return data;
  } catch (error) {
    console.error(`Failed to fetch dealership for slug '${slug}':`, error);
    return null;
  }
}

async function fetchTopVehicleImage(slug: string): Promise<string | null> {
  const backendUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";

  try {
    const res = await fetch(
      `${backendUrl}/api/vehicles?dealership_slug=${slug}&status=all`,
      { cache: "no-store", signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const vehicles: Vehicle[] = await res.json();
    if (Array.isArray(vehicles) && vehicles.length > 0) {
      for (const v of vehicles) {
        if (v.images && v.images.length > 0 && v.images[0].image_url) {
          return v.images[0].image_url;
        }
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return {
      title: "Page Not Found",
    };
  }

  const dealer = await fetchDealership(slug);
  if (!dealer) {
    return {
      title: "Showroom Not Found | AutoShowroom Ethiopia",
      description: "The requested dealership showroom does not exist or is inactive.",
    };
  }

  const title = `${dealer.name} | Digital Showroom`;
  const description =
    "የመኪና ዝርዝሮችን፣ የባንክ ብድር ስሌት እና ቅድመ ክፍያ መረጃዎችን ይመልከቱ።";

  const topVehicleImg = await fetchTopVehicleImage(slug);
  let coverImageUrl = dealer.logo_url
    ? resolveImageUrl(dealer.logo_url)
    : topVehicleImg
    ? resolveImageUrl(topVehicleImg)
    : "/default-car.webp";

  if (coverImageUrl.startsWith("/")) {
    const baseSite =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "https://car.wagadelivery.com";
    coverImageUrl = `${baseSite}${coverImageUrl}`;
  }

  const showroomUrl = `https://car.wagadelivery.com/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: showroomUrl,
      siteName: `${dealer.name} | Digital Showroom`,
      images: [
        {
          url: coverImageUrl,
          width: 1200,
          height: 630,
          alt: `${dealer.name} Digital Showroom`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [coverImageUrl],
    },
  };
}

async function DealershipVanityContent({ params }: PageProps) {
  const { slug } = await params;

  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    notFound();
  }

  const dealer = await fetchDealership(slug);
  if (!dealer) {
    notFound();
  }

  return <DealerShowroomView dealerSlug={slug} />;
}

export default function DealershipVanityPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DealershipVanityContent {...props} />
    </Suspense>
  );
}
