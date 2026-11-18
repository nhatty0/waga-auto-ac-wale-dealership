import { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, cache } from "react";
import DealerShowroomView from "@/components/DealerShowroomView";
import { resolveImageUrl } from "@/lib/images";
import { SITE_URL } from "@/lib/site";
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

// The backend runs on shared hosting and can take well over 4s on a cold start.
const DEALERSHIP_TIMEOUT_MS = 15_000;

type DealershipLookup =
  | { status: "ok"; dealer: Dealership }
  | { status: "not_found" } // backend answered 404
  | { status: "inactive" } // backend says the showroom is switched off
  | { status: "unavailable" }; // timeout / network error / 5xx: backend state unknown

const backendBase = () =>
  (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(
    /\/+$/,
    ""
  );

// cache(): generateMetadata and the page share one lookup per request instead of two.
const lookupDealership = cache(async (slug: string): Promise<DealershipLookup> => {
  // Request-time data: stop prerendering here instead of starting a fetch that the
  // prerender would abort (which would otherwise be logged below as a failure).
  await connection();
  try {
    const res = await fetch(`${backendBase()}/api/public/dealerships/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(DEALERSHIP_TIMEOUT_MS),
    });

    if (res.status === 404) return { status: "not_found" };
    if (res.status === 403) return { status: "inactive" };
    if (!res.ok) {
      console.error(`Dealership lookup for '${slug}' returned HTTP ${res.status}; rendering showroom anyway`);
      return { status: "unavailable" };
    }

    const data: Dealership = await res.json();
    if (data.is_active === false) return { status: "inactive" };
    return { status: "ok", dealer: data };
  } catch (error) {
    // Timeout or network failure is NOT proof the showroom doesn't exist: never 404 on it.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`Dealership lookup for '${slug}' failed (${reason}); rendering showroom anyway`);
    return { status: "unavailable" };
  }
});

async function fetchTopVehicleImage(slug: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${backendBase()}/api/vehicles?dealership_slug=${encodeURIComponent(slug)}&status=all`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const vehicles: Vehicle[] = await res.json();
    if (Array.isArray(vehicles)) {
      for (const v of vehicles) {
        if (v.images && v.images.length > 0 && v.images[0].image_url) {
          return v.images[0].image_url;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return { title: "Page Not Found" };
  }

  const lookup = await lookupDealership(slug);
  if (lookup.status === "not_found" || lookup.status === "inactive") {
    return {
      title: "Showroom Not Found | AC WALE MARKET",
      description: "The requested dealership showroom does not exist or is inactive.",
    };
  }

  const dealerName = lookup.status === "ok" ? lookup.dealer.name : "AC WALE MARKET";
  const title = `${dealerName} | Digital Showroom`;
  const description =
    "የመኪና ዝርዝሮችን፣ የባንክ ብድር ስሌት እና ቅድመ ክፍያ መረጃዎችን ይመልከቱ።";

  const logoUrl = lookup.status === "ok" ? lookup.dealer.logo_url : null;
  const topVehicleImg = await fetchTopVehicleImage(slug);
  let coverImageUrl = logoUrl
    ? resolveImageUrl(logoUrl)
    : topVehicleImg
    ? resolveImageUrl(topVehicleImg)
    : "/default-car.webp";

  if (coverImageUrl.startsWith("/")) {
    coverImageUrl = `${SITE_URL}${coverImageUrl}`;
  }

  const showroomUrl = `${SITE_URL}/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: showroomUrl,
      siteName: title,
      images: [
        {
          url: coverImageUrl,
          width: 1200,
          height: 630,
          alt: `${dealerName} Digital Showroom`,
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

  const lookup = await lookupDealership(slug);
  // Only a definite answer from the backend is a 404. If the backend is slow or unreachable,
  // render the showroom: it loads its own data client-side (with retries via the normal UI).
  if (lookup.status === "not_found" || lookup.status === "inactive") {
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
