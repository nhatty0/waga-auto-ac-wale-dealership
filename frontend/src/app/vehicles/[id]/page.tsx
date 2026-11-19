import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Vehicle } from "@/types";
import VehicleDetailClient from "./VehicleDetailClient";
import { resolveImageUrl } from "@/lib/images";
import { getPlateLabel } from "@/lib/plates";
import { SITE_URL } from "@/lib/site";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchVehicle(id: string): Promise<Vehicle | null> {
  const backendUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";

  try {
    const res = await fetch(`${backendUrl}/api/vehicles/${id}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data: Vehicle = await res.json();
    return data;
  } catch (error) {
    console.error(`Failed to fetch vehicle with id ${id}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await fetchVehicle(id);

  if (!vehicle) {
    return {
      title: "Vehicle Not Found | AC WALE MARKET",
      description: "The requested vehicle is no longer available or does not exist.",
    };
  }

  const dealershipName = vehicle.dealership?.name || "AC WALE MARKET";
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model} - ${dealershipName}`;

  const downPaymentVal = vehicle.cash_price ?? vehicle.down_payment;
  const downPaymentText =
    downPaymentVal != null && downPaymentVal > 0
      ? `${downPaymentVal.toLocaleString()} ETB`
      : "ሙሉ ክፍያ";

  const plateText = getPlateLabel(vehicle.plate_status || vehicle.plate_code, true);
  const priceFormatted =
    vehicle.price != null
      ? `${vehicle.price.toLocaleString()} ETB`
      : "ዋጋ በስልክ (Call for Price)";

  const description = `ዋጋ: ${priceFormatted} | በቅድሚያ/በእጅ: ${downPaymentText} | ሰሌዳ: ${plateText}`;

  // Resolve absolute image URL for Telegram, WhatsApp, and social link unfurling
  let coverImageUrl =
    vehicle.images && vehicle.images.length > 0
      ? resolveImageUrl(vehicle.images[0].image_url)
      : "/default-car.webp";

  if (coverImageUrl.startsWith("/")) {
    const baseApi = SITE_URL;
    coverImageUrl = `${baseApi}${coverImageUrl}`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: vehicle.dealership?.name || "AC WALE MARKET",
      images: [
        {
          url: coverImageUrl,
          width: 1200,
          height: 630,
          alt: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
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

async function VehicleShareContent({ params }: PageProps) {
  const { id } = await params;
  const vehicle = await fetchVehicle(id);

  if (!vehicle) {
    notFound();
  }

  return <VehicleDetailClient vehicle={vehicle} />;
}

export default function VehicleSharePage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VehicleShareContent {...props} />
    </Suspense>
  );
}
