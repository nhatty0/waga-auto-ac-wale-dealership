import { Vehicle } from "@/types";
import { getPlateLabel } from "./plates";
import { SITE_URL } from "./site";
import { getPriceInfo, priceText } from "./price";

export function formatTelegramVehicleCaption(
  vehicle: Vehicle,
  dealershipName?: string
): string {
  const dealerName =
    dealershipName ||
    vehicle.dealership?.name ||
    "AC WALE MARKET";

  const formattedPrice = priceText(vehicle, "ዋጋ በስልክ (Call for Price)");

  const downPaymentVal = vehicle.cash_price ?? vehicle.down_payment;
  const downPaymentText =
    downPaymentVal != null && downPaymentVal > 0
      ? `${downPaymentVal.toLocaleString()} ETB`
      : "ሙሉ ክፍያ";

  const bankLoanVal = vehicle.bank_loan_amount ?? vehicle.bank_loan;
  const bankLoanText =
    vehicle.has_bank_loan && bankLoanVal != null && bankLoanVal > 0
      ? `${bankLoanVal.toLocaleString()} ETB${vehicle.bank_name ? ` (${vehicle.bank_name})` : ""}`
      : "የለም";

  const plateCodeText = getPlateLabel(vehicle.plate_status || vehicle.plate_code, true);

  // With no full price the split is already the price line — don't repeat it.
  const splitIsPrice = getPriceInfo(vehicle).kind === "split";

  return [
    `🚘 *${vehicle.year} ${vehicle.make} ${vehicle.model}*`,
    `💰 ዋጋ: ${formattedPrice}`,
    ...(splitIsPrice
      ? []
      : [
          `💵 በእጅ የሚከፈል (Down Payment): ${downPaymentText}`,
          `🏦 የባንክ ዕዳ: ${bankLoanText}`,
        ]),
    `🏷️ ሰሌዳ: ${plateCodeText}`,
    `📍 የቀረበው በ: ${dealerName}`,
  ].join("\n");
}

export function getVehicleShareUrl(vehicleId: number, baseOrigin?: string): string {
  const origin =
    baseOrigin ||
    (typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : SITE_URL);
  return `${origin}/vehicles/${vehicleId}`;
}

export function openTelegramShare(
  vehicle: Vehicle,
  dealershipName?: string,
  baseOrigin?: string
): string {
  const shareUrl = getVehicleShareUrl(vehicle.id, baseOrigin);
  const formattedCaption = formatTelegramVehicleCaption(vehicle, dealershipName);
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(
    shareUrl
  )}&text=${encodeURIComponent(formattedCaption)}`;

  if (typeof window !== "undefined") {
    window.open(tgUrl, "_blank", "noopener,noreferrer");
  }

  return tgUrl;
}
