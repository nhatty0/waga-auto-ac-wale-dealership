// Public site address and the single-tenant dealership identity.
// NEXT_PUBLIC_SITE_URL is set in .env.production (https://acwalecarmarket.com).

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://acwalecarmarket.com").replace(/\/+$/, "");

/** The one dealership this deployment serves (backend runs with SINGLE_TENANT_MODE on). */
export const PRIMARY_DEALER_SLUG = "ac-wale-cars";
export const PRIMARY_DEALER_NAME = "AC WALE MARKET";

/** Origin of the page in the browser, or the configured site URL during SSR. */
export const getSiteOrigin = () =>
  typeof window !== "undefined" && window.location?.origin ? window.location.origin : SITE_URL;

/** The public showroom is the homepage in single-tenant mode. */
export const getShowroomUrl = () => `${getSiteOrigin()}/`;
