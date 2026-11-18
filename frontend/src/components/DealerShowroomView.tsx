"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  Gauge,
  Fuel,
  Cog,
  ArrowRight,
  Settings,
  Plus,
  Check,
  SlidersHorizontal,
  Phone,
  CarFront,
  Key,
  Car,
  MapPin,
  Clock,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Vehicle, Dealership } from "@/types";
import VehicleModal from "@/components/VehicleModal";
import BookingModal from "@/components/BookingModal";
import RentalBookingModal from "@/components/RentalBookingModal";
import CompareModal from "@/components/CompareModal";
import CompareDock from "@/components/CompareDock";
import FilterDrawer, { FilterState } from "@/components/FilterDrawer";
import AboutSection from "@/components/AboutSection";
import LocationSection from "@/components/LocationSection";
import AboutModal from "@/components/AboutModal";
import TelegramIcon from "@/components/TelegramIcon";
import AnimatedPrice from "@/components/showroom3d/AnimatedPrice";
import { openTelegramShare } from "@/lib/share";
import { getApiBaseUrl } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { useCompare } from "@/context/CompareContext";
import { resolveImageUrl } from "@/lib/images";
import { getPlateLabel, getPlateBadgeClasses, isNewSeriesPlate, getPlateType } from "@/lib/plates";

interface DealerShowroomViewProps {
  dealerSlug: string;
}

type ConditionChipKey =
  | "all"
  | "new_series"
  | "brand_new"
  | "slightly_used"
  | "excellent_condition"
  | "good_condition";

// Bilingual labels for the condition chip row (primary line follows the language toggle).
const CONDITION_CHIPS: { key: ConditionChipKey; am: string; en: string }[] = [
  { key: "all", am: "ሁሉም", en: "All" },
  { key: "new_series", am: "አዲስ ሰሌዳ", en: "New Series (AAA)" },
  { key: "brand_new", am: "አዲስ / ዜሮ ኪ.ሜ", en: "Brand New" },
  { key: "slightly_used", am: "በጥቂቱ ያገለገለ", en: "Slightly Used" },
  { key: "excellent_condition", am: "በጣም ጥሩ ይዞታ", en: "Excellent" },
  { key: "good_condition", am: "ጥሩ ይዞታ", en: "Good" },
];

export const matchesConditionFilter = (
  vehicleCondition: string | undefined | null,
  targetCondition: string
): boolean => {
  if (!targetCondition || targetCondition === "All" || targetCondition === "all") {
    return true;
  }

  const vCond = (vehicleCondition || "").toLowerCase().trim();
  const tCond = targetCondition.toLowerCase().trim();

  // 1. BRAND NEW
  if (
    tCond === "brand new" ||
    tCond === "brand_new" ||
    tCond.includes("አዲስ")
  ) {
    return vCond === "brand new" || vCond.includes("አዲስ");
  }

  // 2. SLIGHTLY USED or EXCELLENT CONDITION (OR overlap across both categories)
  if (
    tCond === "slightly used" ||
    tCond === "slightly_used" ||
    tCond === "excellent condition" ||
    tCond === "excellent_condition" ||
    tCond.includes("በጥቂቱ") ||
    tCond.includes("በጣም ጥሩ")
  ) {
    return (
      vCond === "slightly used" ||
      vCond === "excellent condition" ||
      vCond.includes("በጥቂቱ") ||
      vCond.includes("በጣም ጥሩ")
    );
  }

  // 3. GOOD CONDITION (includes Slightly Used, Excellent Condition, and Good Condition)
  if (
    tCond === "good condition" ||
    tCond === "good_condition" ||
    tCond.includes("ጥሩ ይዞታ")
  ) {
    return (
      vCond === "slightly used" ||
      vCond === "excellent condition" ||
      vCond === "good condition" ||
      vCond.includes("በጥቂቱ") ||
      vCond.includes("በጣም ጥሩ") ||
      vCond.includes("ጥሩ")
    );
  }

  return vCond === tCond;
};

export default function DealerShowroomView({ dealerSlug }: DealerShowroomViewProps) {
  const { lang, toggleLang, t } = useLanguage();
  const {
    selectedVehicles,
    toggleCompare,
    isInCompare,
    isCompareModalOpen,
    setIsCompareModalOpen,
  } = useCompare();
  const router = useRouter();

  const [dealership, setDealership] = useState<Dealership | null>(null);
  const [logoImgError, setLogoImgError] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<ConditionChipKey>("all");
  const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);
  const [rentalVehicle, setRentalVehicle] = useState<Vehicle | null>(null);
  const [catalogMode, setCatalogMode] = useState<"buy" | "rent">("buy");
  const [aboutModalTab, setAboutModalTab] = useState<"about" | "location" | null>(null);

  const defaultFilters: FilterState = {
    minPrice: "",
    maxPrice: "",
    transmission: "All",
    plateStatus: "All",
    bankLoanOnly: false,
    fuelType: "All",
    condition: "All",
    brand: "All",
    showSold: false,
  };

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: shouldReduceMotion ? 1 : 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.07,
      },
    },
  };

  const cardVariants = {
    hidden: {
      opacity: shouldReduceMotion ? 1 : 0,
      y: shouldReduceMotion ? 0 : 20,
      scale: shouldReduceMotion ? 1 : 0.98,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: "easeOut" as const,
      },
    },
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.minPrice !== "") count++;
    if (filters.maxPrice !== "") count++;
    if (filters.transmission !== "All") count++;
    if (filters.plateStatus !== "All") count++;
    if (filters.bankLoanOnly) count++;
    if (filters.fuelType !== "All") count++;
    if (filters.condition !== "All") count++;
    if (filters.brand !== "All") count++;
    if (filters.showSold) count++;
    return count;
  }, [filters]);

  // Brands offered in the filter drawer: the original Toyota / BYD shortcuts plus every make in stock.
  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of ["Toyota", "BYD", ...vehicles.map((v) => (v.make || "").trim())]) {
      if (b && !seen.has(b.toLowerCase())) seen.set(b.toLowerCase(), b);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const handleResetFilters = () => {
    setFilters(defaultFilters);
  };

  const fetchShowroomData = async (slug: string) => {
    try {
      setLoading(true);
      const baseApi = getApiBaseUrl();

      // 1. Fetch public dealership profile
      try {
        const dRes = await fetch(`${baseApi}/api/public/dealerships/${slug}`);
        if (dRes.ok) {
          const dData = await dRes.json();
          setDealership(dData);
          setLogoImgError(false);
        } else if (slug !== "ac-wale-cars") {
          const fallbackRes = await fetch(`${baseApi}/api/public/dealerships/ac-wale-cars`);
          if (fallbackRes.ok) {
            setDealership(await fallbackRes.json());
          }
        }
      } catch (dErr) {
        console.error("Failed to load dealership profile", dErr);
      }

      // 2. Fetch scoped vehicles
      const res = await fetch(`${baseApi}/api/vehicles?status=all&dealership_slug=${slug}`);
      if (res.ok) {
        const data = await res.json();
        setVehicles(Array.isArray(data) ? data : []);
      } else {
        setVehicles([]);
      }
    } catch (err) {
      console.error("Failed to load vehicles from API", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const isAuth =
      typeof window !== "undefined" &&
      (!!localStorage.getItem("token") ||
        !!localStorage.getItem("dealer_token") ||
        sessionStorage.getItem("dealer_authenticated") === "true");
    setIsAdminSession(isAuth);
    fetchShowroomData(dealerSlug);
  }, [dealerSlug]);

  const handleSecretLogoTap = () => {
    const newCount = logoClicks + 1;
    setLogoClicks(newCount);

    if (newCount >= 3) {
      setLogoClicks(0);
      router.push("/admin");
    }

    setTimeout(() => {
      setLogoClicks(0);
    }, 1500);
  };

  const filteredVehicles = vehicles.filter((v) => {
    // Catalog mode filter (Buy vs Rent)
    if (catalogMode === "rent") {
      const isRental = v.listing_type === "rent" || v.listing_type === "both";
      if (!isRental) return false;
      if (v.rental_available === false) return false;
    } else {
      if (v.listing_type === "rent") return false;
    }

    if (!filters.showSold && v.status === "Sold") return false;

    if (filters.brand !== "All" && !(v.make || "").toLowerCase().includes(filters.brand.toLowerCase())) {
      return false;
    }

    const searchableText =
      `${v.make || ""} ${v.model || ""} ${v.year || ""} ${v.body_type || ""}`.toLowerCase();
    const matchesSearch = searchableText.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedCategoryKey !== "all") {
      if (selectedCategoryKey === "new_series") {
        if (!isNewSeriesPlate(v.plate_status)) return false;
      } else if (!matchesConditionFilter(v.condition, selectedCategoryKey)) {
        // Condition chips (with OR overlap for Slightly Used & Excellent Condition)
        return false;
      }
    }

    if (filters.minPrice !== "") {
      const min = parseFloat(filters.minPrice);
      if (!isNaN(min) && (v.price == null || v.price < min)) return false;
    }

    if (filters.maxPrice !== "") {
      const max = parseFloat(filters.maxPrice);
      if (!isNaN(max) && (v.price == null || v.price > max)) return false;
    }

    if (filters.bankLoanOnly && !v.has_bank_loan) {
      return false;
    }

    if (filters.transmission !== "All") {
      if ((v.transmission || "").toLowerCase() !== filters.transmission.toLowerCase()) {
        return false;
      }
    }

    if (filters.plateStatus !== "All") {
      if (filters.plateStatus === "new_series") {
        if (!isNewSeriesPlate(v.plate_status)) return false;
      } else {
        const pType = getPlateType(v.plate_status);
        const filterType = getPlateType(filters.plateStatus);
        if (pType !== filterType) {
          return false;
        }
      }
    }

    if (filters.fuelType !== "All") {
      if ((v.fuel_type || "").toLowerCase() !== filters.fuelType.toLowerCase()) {
        return false;
      }
    }

    if (filters.condition !== "All") {
      if (!matchesConditionFilter(v.condition, filters.condition)) {
        return false;
      }
    }

    return true;
  });

  // Short, single-language condition label for card badges (the full bilingual label is in the detail view).
  const getShortConditionLabel = (cond?: string) => {
    const lower = (cond || "").toLowerCase();
    const key: ConditionChipKey =
      lower === "brand new"
        ? "brand_new"
        : lower === "slightly used"
        ? "slightly_used"
        : lower === "excellent condition"
        ? "excellent_condition"
        : "good_condition";
    const chip = CONDITION_CHIPS.find((c) => c.key === key)!;
    return lang === "am" ? chip.am : chip.en;
  };

  return (
    <main className="min-h-screen bg-black text-white pb-32">
      {/* Dealership-Specific Mobile-First Header */}
      <header className="sticky top-0 z-40 bg-black/70 backdrop-blur-xl border-b border-white/[0.06] pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-2">
          <div
            onClick={handleSecretLogoTap}
            className="flex items-center gap-2 cursor-pointer select-none active:scale-95 transition min-w-0 flex-1"
            title="AC WALE MARKET (ኤሲ ዋለ የመኪና መሸጫ)"
          >
            <img
              src="/ac-wale-logo.png"
              alt="AC WALE"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-contain shrink-0 bg-black border border-zinc-800/80"
            />
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="font-black text-sm sm:text-base md:text-lg tracking-tight text-white leading-tight uppercase whitespace-nowrap truncate">
                AC WALE MARKET
              </h1>
              <span className="hidden min-[400px]:block text-[11px] text-amber-400 font-semibold leading-tight truncate">
                ኤሲ ዋለ የመኪና መሸጫ
              </span>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
            {/* Desktop Navigation Links: About Us & Location */}
            <div className="hidden lg:flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-full text-xs font-bold text-zinc-300">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("about-us");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  else setAboutModalTab("about");
                }}
                className="py-1 px-3 rounded-full hover:bg-zinc-800 hover:text-amber-400 transition"
              >
                {lang === "am" ? "ስለ እኛ" : "About Us"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("showroom-location");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  else setAboutModalTab("location");
                }}
                className="py-1 px-3 rounded-full hover:bg-zinc-800 hover:text-amber-400 transition flex items-center gap-1"
              >
                <MapPin size={12} className="text-amber-400" />
                <span>{lang === "am" ? "አድራሻ" : "Location"}</span>
              </button>
            </div>

            {/* Mobile About / Location trigger pill */}
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("showroom-location");
                if (el) el.scrollIntoView({ behavior: "smooth" });
                else setAboutModalTab("location");
              }}
              data-location-button
              className="lg:hidden h-11 w-11 rounded-full text-amber-400 hover:bg-white/5 flex items-center justify-center active:scale-95 transition"
              title="Showroom Location & Trust / አድራሻ"
              aria-label={lang === "am" ? "አድራሻ" : "Showroom location"}
            >
              <MapPin size={19} />
            </button>

            {/* Language Switcher: shows the language you'll switch TO on phones, both on larger screens */}
            <button
              onClick={toggleLang}
              className="h-11 min-w-11 px-1.5 sm:px-3 rounded-full sm:bg-zinc-900 sm:border sm:border-zinc-700/80 hover:border-amber-500 text-xs font-bold text-zinc-200 hover:text-amber-400 transition flex items-center justify-center gap-1"
              title="Switch Language / ቋንቋ ቀይር"
              aria-label={lang === "am" ? "Switch to English" : "ወደ አማርኛ ቀይር"}
            >
              <span className="sm:hidden text-[13px] font-black">{lang === "am" ? "EN" : "አማ"}</span>
              <span className={`hidden sm:inline ${lang === "en" ? "text-amber-400 font-black" : "text-zinc-500 font-normal"}`}>
                EN
              </span>
              <span className="hidden sm:inline text-zinc-600">|</span>
              <span className={`hidden sm:inline ${lang === "am" ? "text-amber-400 font-black" : "text-zinc-500 font-normal"}`}>
                አማ
              </span>
            </button>

            {/* Direct Contact CTA: prominent round button on phones, number on larger screens */}
            <a
              href="tel:+251911646628"
              className="h-11 w-11 sm:w-auto sm:px-4 ml-0.5 sm:ml-0 text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 rounded-full transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 shrink-0 active:scale-95"
              title="Call Sales Desk (+251 911 646 628)"
              aria-label={lang === "am" ? "ደውል +251 911 646 628" : "Call +251 911 646 628"}
            >
              <Phone size={18} className="sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">+251 911 646 628</span>
            </a>

            <a
              href="tel:+251900061300"
              className="hidden md:flex h-11 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-4 rounded-full hover:bg-amber-500/20 transition items-center gap-1.5 shadow-sm shrink-0"
              title="Call Sales Desk (+251 900 061 300)"
            >
              <Phone size={12} className="text-amber-400" />
              <span>+251 900 061 300</span>
            </a>
          </div>
        </div>
      </header>

      {/* Search & Category Section */}
      <div className="max-w-5xl mx-auto px-4 pt-4 sm:pt-10 pb-3">
        {/* Hero: one tagline (the brand name is already in the header) */}
        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium mb-3">
          <Sparkles size={12} /> {t.verifiedBadge}
        </span>
        <h2 className="flex items-start gap-1.5 text-[15px] sm:text-3xl font-bold sm:font-black tracking-tight text-white leading-snug">
          <Sparkles size={16} className="sm:hidden mt-[3px] shrink-0 text-amber-400" />
          <span>
            {lang === "am"
              ? "የተረጋገጡ መኪኖች — ይግዙ ወይም ይከራዩ"
              : "Verified cars to buy or rent in Addis Ababa"}
          </span>
        </h2>

        {/* PRIMARY CATALOG TOGGLE: BUY A CAR vs RENT A CAR */}
        <div
          role="tablist"
          aria-label={lang === "am" ? "ይግዙ ወይም ይከራዩ" : "Buy or rent"}
          className="mt-3 sm:mt-5 grid grid-cols-2 gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl w-full sm:max-w-md"
        >
          {(["buy", "rent"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={catalogMode === mode}
              data-catalog-mode={mode}
              onClick={() => setCatalogMode(mode)}
              className={`h-11 px-3 rounded-xl font-black text-[13px] sm:text-sm transition flex items-center justify-center gap-2 ${
                catalogMode === mode
                  ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              {mode === "buy" ? <CarFront size={16} /> : <Key size={16} />}
              <span className="truncate">
                {mode === "buy"
                  ? lang === "am" ? "መኪና ይግዙ" : "Buy a Car"
                  : lang === "am" ? "መኪና ይከራዩ" : "Rent a Car"}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input & Advanced Filter Trigger */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
            />
            <input
              type="search"
              enterKeyHint="search"
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 bg-zinc-900 border border-zinc-800 rounded-2xl pl-11 pr-3 text-base sm:text-sm text-white placeholder:text-zinc-500 placeholder:text-sm focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <button
            type="button"
            data-filter-button
            onClick={() => setIsFilterDrawerOpen(true)}
            className={`relative h-12 w-12 sm:w-auto sm:px-4 rounded-2xl border font-bold text-sm transition flex items-center justify-center gap-2 shrink-0 active:scale-95 ${
              activeFilterCount > 0
                ? "bg-amber-500/15 border-amber-500/60 text-amber-300"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700"
            }`}
            title="Advanced Filters"
            aria-label={
              activeFilterCount > 0 ? `${t.filters} (${activeFilterCount})` : t.filters
            }
          >
            <SlidersHorizontal size={18} className="text-amber-400" />
            <span className="hidden sm:inline">{t.filters}</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 sm:static min-w-5 h-5 px-1 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center ring-2 ring-black sm:ring-0">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Condition chips: one horizontally scrollable, snapping row */}
        <div
          role="group"
          aria-label={lang === "am" ? "ይዞታ" : "Condition"}
          className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible"
        >
          {CONDITION_CHIPS.map((chip) => {
            const active = selectedCategoryKey === chip.key;
            const primary = lang === "am" ? chip.am : chip.en;
            const secondary = lang === "am" ? chip.en : chip.am;
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedCategoryKey(chip.key)}
                className={`snap-start shrink-0 h-11 px-4 rounded-full flex flex-col items-center justify-center leading-none transition whitespace-nowrap ${
                  active
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <span className="text-[13px] font-bold">{primary}</span>
                <span className={`text-[9.5px] mt-1 font-medium ${active ? "text-black/70" : "text-zinc-500"}`}>
                  {secondary}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Vehicle Grid */}
      <section className="max-w-5xl mx-auto px-4 pt-1">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-500 text-xs">{t.loading}</p>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="py-16 text-center bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
            <p className="text-zinc-400 text-xs">{t.noCars}</p>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredVehicles.map((car) => {
              const coverImg = resolveImageUrl(
                car.images[0]?.image_url,
                "https://images.unsplash.com/photo-1594502184342-2e12f877aa73?auto=format&fit=crop&w=800&q=80"
              );

              return (
                <motion.div
                  key={car.id}
                  variants={cardVariants}
                  layoutId={`vehicle-card-${car.id}`}
                  whileHover={shouldReduceMotion ? {} : { y: -6, scale: 1.015, transition: { duration: 0.25 } }}
                  onClick={() => setActiveVehicle(car)}
                  data-vehicle-card
                  data-vehicle-id={car.id}
                  className="min-w-0 bg-zinc-900/70 ring-1 ring-white/[0.06] hover:ring-amber-500/40 rounded-2xl overflow-hidden transition-shadow cursor-pointer group flex flex-col shadow-lg hover:shadow-2xl hover:shadow-amber-500/10"
                >
                  <div className="relative aspect-[16/10] w-full bg-zinc-950 overflow-hidden">
                    <img
                      src={coverImg}
                      alt={car.model}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80";
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                    {/* Condition Badge (Top-Left) */}
                    <span
                      className={`absolute top-3 left-3 max-w-[60%] truncate backdrop-blur-md text-[11px] font-bold px-2.5 py-1 rounded-full border shadow-md ${
                        car.condition === "Brand New"
                          ? "bg-amber-500/90 text-black border-amber-400"
                          : car.condition === "Slightly Used"
                            ? "bg-emerald-500/80 text-black border-emerald-400"
                            : car.condition === "Excellent Condition"
                              ? "bg-sky-500/80 text-black border-sky-400"
                              : "bg-black/75 text-zinc-200 border-zinc-700"
                      }`}
                    >
                      ★ {getShortConditionLabel(car.condition)}
                    </span>

                    {/* Status Badge (Top-Right: Sold, Reserved, In Transit) */}
                    {car.status !== "Available" && (
                      <span
                        className={`absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider backdrop-blur-md shadow-lg border ${
                          car.status === "Sold"
                            ? "bg-red-500/90 text-white border-red-400/30"
                            : car.status === "Reserved"
                            ? "bg-amber-500 text-black border-amber-400 shadow-amber-500/40 animate-pulse font-black"
                            : "bg-sky-500/90 text-white border-sky-400/30"
                        }`}
                      >
                        {car.status === "Reserved" && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-black mr-1 align-middle" />
                        )}
                        {car.status === "Sold"
                          ? t.statusSold
                          : car.status === "Reserved"
                          ? t.statusReserved
                          : t.statusInTransit}
                      </span>
                    )}

                    {/* Plate Status Badge (Bottom-Left) */}
                    <span className={`absolute bottom-3 left-3 max-w-[70%] truncate text-[11px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-md ${getPlateBadgeClasses(car.plate_status)}`}>
                      🏷️ {getPlateLabel(car.plate_status, lang === "am")}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div className="min-w-0">
                      <span className="block text-zinc-500 text-[11px] font-semibold uppercase tracking-wide truncate">
                        {car.make}
                      </span>
                      <h3 className="font-bold text-white text-[17px] leading-snug line-clamp-2 break-words">
                        {car.year} {car.model}
                      </h3>
                    </div>

                    {/* Key specs as small inline chips */}
                    <ul className="flex flex-wrap gap-1.5 text-[11px] text-zinc-300">
                      <li className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/[0.05]">
                        <Gauge size={12} className="text-zinc-500" />
                        {(car.mileage ?? 0).toLocaleString()} km
                      </li>
                      {car.fuel_type && (
                        <li className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/[0.05]">
                          <Fuel size={12} className="text-zinc-500" />
                          {car.fuel_type}
                        </li>
                      )}
                      {car.transmission && (
                        <li className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/[0.05]">
                          <Cog size={12} className="text-zinc-500" />
                          {car.transmission}
                        </li>
                      )}
                      {car.body_type && (
                        <li className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/[0.05]">
                          <Car size={12} className="text-zinc-500" />
                          {car.body_type}
                        </li>
                      )}
                    </ul>

                    <div className="mt-auto pt-3 border-t border-white/[0.06] flex flex-col gap-3">
                      {catalogMode === "rent" || (car.listing_type === "rent" && !car.price) ? (
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold block">
                            {lang === "am" ? "የቀን ኪራይ" : "Daily Rental Rate"}
                          </span>
                          <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className="text-amber-400 font-black text-lg">
                              {((car.rental_daily_rate ?? (car as any).daily_rental_rate ?? (car as any).daily_rate) || 3500).toLocaleString()} ETB
                            </span>
                            <span className="text-zinc-400 text-[10px] font-semibold">
                              / {lang === "am" ? "ቀን" : "day"}
                            </span>
                          </div>
                          {car.with_driver_only && (
                            <span className="text-[10px] text-sky-400 font-bold block mt-0.5">
                              👨‍✈️ {lang === "am" ? "ከአሽከርካሪ ጋር" : "Driver included"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <AnimatedPrice
                          price={car.price}
                          cashPrice={car.cash_price ?? car.down_payment}
                          bankLoanAmount={car.bank_loan_amount ?? car.bank_loan}
                          bankName={car.bank_name}
                          hasBankLoan={car.has_bank_loan}
                          lang={lang}
                          size="md"
                        />
                      )}

                      <div className="flex items-center gap-2">
                        {/* Telegram Instant Share */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTelegramShare(car, dealership?.name || "AC Wale Cars");
                          }}
                          className="h-11 w-11 shrink-0 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#45B6ED] hover:text-white rounded-xl transition flex items-center justify-center active:scale-95"
                          title={lang === "am" ? "በቴሌግራም አጋራ" : "Share on Telegram"}
                          aria-label={lang === "am" ? "በቴሌግራም አጋራ" : "Share on Telegram"}
                        >
                          <TelegramIcon size={17} />
                        </button>

                        {/* Compare Toggle Button */}
                        <button
                          type="button"
                          data-compare-toggle
                          aria-pressed={isInCompare(car.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCompare(car);
                          }}
                          className={`h-11 px-3 shrink-0 rounded-xl text-xs font-semibold border transition flex items-center gap-1 whitespace-nowrap ${
                            isInCompare(car.id)
                              ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-sm"
                              : "bg-zinc-800/60 border-zinc-700/80 text-zinc-400 hover:text-white hover:border-zinc-600"
                          }`}
                          title={isInCompare(car.id) ? t.compared : t.compare}
                        >
                          {isInCompare(car.id) ? (
                            <>
                              <Check size={12} className="text-amber-400" />
                              <span>{t.compared}</span>
                            </>
                          ) : (
                            <>
                              <Plus size={12} />
                              <span>{t.compare}</span>
                            </>
                          )}
                        </button>

                        {/* Action Button: Rent Mode -> Book Rental; Buy Mode -> Book Visit */}
                        {catalogMode === "rent" ? (
                          <button
                            data-rent-button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRentalVehicle(car);
                            }}
                            className="h-11 flex-1 min-w-0 px-3 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl text-[13px] transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 whitespace-nowrap"
                          >
                            <Key size={13} />
                            <span>{lang === "am" ? "መኪና ይከራዩ" : "Rent"}</span>
                            <ArrowRight size={13} />
                          </button>
                        ) : car.status === "Sold" ? (
                          <a
                            href={`https://t.me/WagaDealershipBot?text=${encodeURIComponent(
                              `ሰላም AC Wale Cars! የ${car.year} ${car.make} ${car.model} ተሽጧል የሚል አየሁ። እባካችሁ ተመሳሳይ መኪና ፈልጉልኝ።`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="h-11 flex-1 min-w-0 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-[13px] font-semibold transition flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <span className="truncate">{t.findSimilar}</span>
                          </a>
                        ) : (
                          <button
                            data-book-button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBookingVehicle(car);
                            }}
                            className="h-11 flex-1 min-w-0 px-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-[13px] font-black transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 whitespace-nowrap"
                          >
                            <span className="truncate">{lang === "am" ? "ቀጠሮ ይያዙ" : "Book a Visit"}</span>
                            <ArrowRight size={15} className="shrink-0" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>

      {/* ABOUT US & TRUST ENGINE */}
      <AboutSection lang={lang} />

      {/* SHOWROOM LOCATION & VISIT LOT */}
      <LocationSection lang={lang} />

      {/* Modals */}
      {activeVehicle && (
        <VehicleModal
          vehicle={activeVehicle}
          dealership={dealership}
          onClose={() => setActiveVehicle(null)}
          onBook={() => setBookingVehicle(activeVehicle)}
        />
      )}

      {bookingVehicle && (
        <BookingModal
          vehicle={bookingVehicle}
          dealership={dealership}
          onClose={() => setBookingVehicle(null)}
          onSuccess={() => {}}
        />
      )}

      {rentalVehicle && (
        <RentalBookingModal
          vehicle={rentalVehicle}
          dealership={dealership}
          onClose={() => setRentalVehicle(null)}
          onSuccess={() => {}}
        />
      )}

      {/* Floating Compare Dock */}
      <CompareDock />

      {/* Side-by-Side Compare Modal */}
      {isCompareModalOpen && selectedVehicles.length === 2 && (
        <CompareModal
          vehicles={selectedVehicles}
          dealership={dealership}
          onClose={() => setIsCompareModalOpen(false)}
          onBook={(car) => {
            setIsCompareModalOpen(false);
            setBookingVehicle(car);
          }}
        />
      )}

      {/* Advanced Filter Drawer */}
      <FilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        filters={filters}
        setFilters={setFilters}
        onReset={handleResetFilters}
        resultCount={filteredVehicles.length}
        brandOptions={brandOptions}
      />

      {/* OFFICIAL AC WALE MARKET FOOTER */}
      <footer className="mt-20 border-t border-zinc-800/80 bg-zinc-950 py-12 px-4 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/ac-wale-logo.png"
              alt="AC WALE MARKET"
              className="h-10 w-10 rounded-lg object-contain bg-black border border-zinc-800"
            />
            <div className="text-left">
              <span className="font-black text-sm tracking-wider text-amber-400 block uppercase">
                AC WALE MARKET
              </span>
              <span className="text-xs text-zinc-400 block font-medium">
                ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ
              </span>
            </div>
          </div>

          {/* Showroom Address & Hours in Footer */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 w-full max-w-2xl text-left grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5 text-amber-400">
                <MapPin size={13} /> {lang === "am" ? "የሾውሩም አድራሻ" : "Showroom Address"}
              </span>
              <p className="text-zinc-200 leading-relaxed font-semibold">
                {lang === "am" 
                  ? "22 (ሃያ ሁለት) አዋራሪስ ሆቴል ጀርባ፣ አዲስ አበባ" 
                  : "Hayahulet, Behind Awraris Hotel, Addis Ababa, Ethiopia"}
              </p>
              <a
                href="https://maps.app.goo.gl/v5NbRBzRNaNNZWzQA?g_st=atm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:underline pt-1"
              >
                <span>{lang === "am" ? "📍 በ Google Maps ይመልከቱ (Awraris Hotel Pin)" : "📍 View on Google Maps (Behind Awraris Hotel)"}</span>
              </a>
            </div>

            <div className="space-y-1.5 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-3 sm:pt-0 sm:pl-4">
              <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5 text-amber-400">
                <Clock size={13} /> {lang === "am" ? "የስራ ሰዓታት" : "Working Hours"}
              </span>
              <p className="text-zinc-300 font-mono text-[11px]">
                {lang === "am" ? "ሰኞ - ቅዳሜ:" : "Mon - Sat:"} 2:30 ጠዋት - 12:30 ማታ (8:30 AM - 6:30 PM)
              </p>
              <p className="text-zinc-400 text-[11px]">
                {lang === "am" ? "እሁድ: በከፊል ክፍት / በቀጠሮ" : "Sun: Half Day / By Appointment"}
              </p>
            </div>
          </div>

          {/* Contact Direct Hotlines */}
          <div className="flex flex-wrap justify-center items-center gap-3 text-xs font-semibold">
            <a
              href="tel:+251911646628"
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full"
            >
              <Phone size={13} />
              <span>+251 911 646 628</span>
            </a>
            <a
              href="tel:+251900061300"
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full"
            >
              <Phone size={13} />
              <span>+251 900 061 300</span>
            </a>
            <a
              href="mailto:acwalecarmarket@gmail.com"
              className="text-zinc-400 hover:text-zinc-200 transition py-1 px-2"
            >
              acwalecarmarket@gmail.com
            </a>
          </div>

          <p className="text-xs text-zinc-500 font-medium pt-2">
            © 2026 AC WALE MARKET. All rights reserved. Addis Ababa, Ethiopia
          </p>
        </div>
      </footer>

      {/* Standalone About & Location Modal */}
      {aboutModalTab && (
        <AboutModal
          isOpen={true}
          initialTab={aboutModalTab}
          lang={lang}
          onClose={() => setAboutModalTab(null)}
        />
      )}

      {/* FLOATING ADMIN QUICK-SWITCH (Only visible if dealer has unlocked the session) */}
      {isAdminSession && (
        <button
          onClick={() => router.push("/admin")}
          className="fixed bottom-6 right-6 z-50 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 rounded-full font-bold text-xs flex items-center gap-2 shadow-2xl shadow-amber-500/40 border border-amber-300 transition animate-in slide-in-from-bottom"
        >
          <Settings size={15} className="animate-spin-slow" />
          <span>Admin Portal</span>
        </button>
      )}
    </main>
  );
}
