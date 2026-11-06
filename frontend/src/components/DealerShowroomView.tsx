"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  Gauge,
  ArrowRight,
  Settings,
  Plus,
  Check,
  SlidersHorizontal,
  Phone,
  CarFront,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Vehicle, Dealership } from "@/types";
import VehicleModal from "@/components/VehicleModal";
import BookingModal from "@/components/BookingModal";
import CompareModal from "@/components/CompareModal";
import CompareDock from "@/components/CompareDock";
import FilterDrawer, { FilterState } from "@/components/FilterDrawer";
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
  const [hideSold, setHideSold] = useState(true);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<
    "all" | "toyota" | "byd" | "electric" | "brand_new" | "new_series"
  >("all");
  const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);

  const defaultFilters: FilterState = {
    minPrice: "",
    maxPrice: "",
    transmission: "All",
    plateStatus: "All",
    bankLoanOnly: false,
    fuelType: "All",
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
    return count;
  }, [filters]);

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
        } else if (slug !== "elite-motors") {
          const fallbackRes = await fetch(`${baseApi}/api/public/dealerships/elite-motors`);
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

  const categories: {
    key: "all" | "toyota" | "byd" | "electric" | "brand_new" | "new_series";
    label: string;
  }[] = [
    { key: "all", label: t.catAll },
    { key: "new_series", label: lang === "am" ? "አዲስ ሰሌዳ (AAA)" : "New Series (AAA)" },
    { key: "toyota", label: t.catToyota },
    { key: "byd", label: t.catByd },
    { key: "electric", label: t.catElectric },
    { key: "brand_new", label: t.catBrandNew },
  ];

  const filteredVehicles = vehicles.filter((v) => {
    if (hideSold && v.status === "Sold") return false;

    const searchableText =
      `${v.make || ""} ${v.model || ""} ${v.year || ""} ${v.body_type || ""}`.toLowerCase();
    const matchesSearch = searchableText.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedCategoryKey !== "all") {
      const make = (v.make || "").toLowerCase();
      const fuel = (v.fuel_type || "").toLowerCase();
      const condition = (v.condition || "").toLowerCase();

      if (selectedCategoryKey === "new_series" && !isNewSeriesPlate(v.plate_status)) return false;
      if (selectedCategoryKey === "toyota" && !make.includes("toyota")) return false;
      if (selectedCategoryKey === "byd" && !make.includes("byd")) return false;
      if (selectedCategoryKey === "electric" && fuel !== "electric") return false;
      if (selectedCategoryKey === "brand_new" && condition !== "brand new") return false;
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

    return true;
  });

  const getConditionLabel = (cond?: string) => {
    const lower = (cond || "").toLowerCase();
    if (lower === "brand new") return t.conditionBrandNew;
    if (lower === "slightly used") return t.conditionSlightlyUsed;
    if (lower === "excellent condition") return t.conditionExcellent;
    return t.conditionGood;
  };

  return (
    <main className="min-h-screen bg-black text-white pb-32">
      {/* Dealership-Specific Mobile-First Header */}
      <header className="sticky top-0 z-40 bg-black/85 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div
            onClick={handleSecretLogoTap}
            className="flex items-center gap-2 cursor-pointer select-none active:scale-95 transition"
            title={dealership ? dealership.name : "Elite Motors"}
          >
            {dealership?.logo_url && !logoImgError ? (
              <img
                src={resolveImageUrl(dealership.logo_url)}
                alt={dealership.name}
                onError={() => setLogoImgError(true)}
                className="w-8 h-8 rounded-xl object-cover shadow-md shadow-amber-500/20 border border-amber-500/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-md shadow-amber-500/10 flex-shrink-0">
                <CarFront size={17} />
              </div>
            )}
            <div>
              <h1 className="font-black text-sm tracking-tight text-white leading-none uppercase">
                {dealership?.name || "ELITE MOTORS"}
              </h1>
              <span className="text-[10px] text-zinc-500 font-medium">
                {t.showroomSubtitle}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language Switcher Pill */}
            <button
              onClick={toggleLang}
              className="px-2.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-700/80 hover:border-amber-500 text-xs font-bold text-zinc-200 hover:text-amber-400 transition flex items-center gap-1.5"
              title="Switch Language / ቋንቋ ቀይር"
            >
              <span
                className={
                  lang === "en"
                    ? "text-amber-400 font-black"
                    : "text-zinc-500 font-normal"
                }
              >
                EN
              </span>
              <span className="text-zinc-600">|</span>
              <span
                className={
                  lang === "am"
                    ? "text-amber-400 font-black"
                    : "text-zinc-500 font-normal"
                }
              >
                አማ
              </span>
            </button>

            <a
              href={`tel:${dealership?.phone_number || "+251905445544"}`}
              className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full hover:bg-amber-500/20 transition flex items-center gap-1.5"
            >
              <Phone size={13} />
              <span>{t.contactSales}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Search & Category Section */}
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-4">
        <div className="mb-4">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium mb-2">
            <Sparkles size={12} /> {t.verifiedBadge}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {dealership ? dealership.name : t.heroHeadline}
          </h2>
          <p className="text-zinc-400 text-xs mt-1">{t.heroSubheadline}</p>
        </div>

        {/* Search Input & Advanced Filter Trigger */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-3.5 text-zinc-500"
            />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 transition shadow-inner"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsFilterDrawerOpen(true)}
            className={`py-3 px-3.5 sm:px-4 rounded-2xl border font-bold text-xs sm:text-sm transition flex items-center gap-2 flex-shrink-0 active:scale-95 shadow-md ${
              activeFilterCount > 0
                ? "bg-amber-500 border-amber-400 text-black shadow-amber-500/20 font-black"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700"
            }`}
            title="Advanced Filters"
          >
            <SlidersHorizontal size={16} className={activeFilterCount > 0 ? "text-black" : "text-amber-400"} />
            <span>{t.filters}</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-black text-amber-400 text-[11px] font-black flex items-center justify-center shadow">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Category Pills & Sold Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-6">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategoryKey(cat.key)}
                className={`py-1.5 px-3.5 rounded-full text-xs font-semibold transition ${
                  selectedCategoryKey === cat.key
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Hide/Show Sold Toggle */}
          <button
            type="button"
            onClick={() => setHideSold(!hideSold)}
            className={`text-xs font-semibold py-1.5 px-3 rounded-xl border transition flex items-center gap-1.5 ${
              hideSold
                ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                hideSold ? "bg-zinc-400" : "bg-emerald-400"
              }`}
            />
            {hideSold ? t.showSold : t.hideSold}
          </button>
        </div>
      </div>

      {/* Vehicle Grid */}
      <section className="max-w-4xl mx-auto px-4 pt-2">
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
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
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
                  className="bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/40 rounded-2xl overflow-hidden transition-colors cursor-pointer group flex flex-col justify-between shadow-lg hover:shadow-2xl hover:shadow-amber-500/10"
                >
                  <div className="relative h-48 w-full bg-zinc-950 overflow-hidden">
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
                      className={`absolute top-3 left-3 backdrop-blur-md text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-md ${
                        car.condition === "Brand New"
                          ? "bg-amber-500/90 text-black border-amber-400"
                          : car.condition === "Slightly Used"
                            ? "bg-emerald-500/80 text-black border-emerald-400"
                            : "bg-black/75 text-zinc-200 border-zinc-700"
                      }`}
                    >
                      ★ {getConditionLabel(car.condition)}
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
                    <span className={`absolute bottom-3 left-3 text-[10px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-md ${getPlateBadgeClasses(car.plate_status)}`}>
                      🏷️ {getPlateLabel(car.plate_status, lang === "am")}
                    </span>

                    <span className="absolute bottom-3 right-3 bg-black/75 backdrop-blur-md text-zinc-300 text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Gauge size={12} /> {(car.mileage ?? 0).toLocaleString()} km
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <span className="text-zinc-500 text-[11px] font-semibold uppercase">
                        {car.make}
                      </span>
                      <h3 className="font-bold text-white text-base leading-tight">
                        {car.year} {car.model}
                      </h3>
                      <p className="text-zinc-400 text-[11px] mt-0.5">
                        {car.fuel_type} • {car.transmission} • {car.body_type} • {getPlateLabel(car.plate_status, lang === "am")}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <AnimatedPrice
                        price={car.price}
                        cashPrice={car.cash_price ?? car.down_payment}
                        bankLoanAmount={car.bank_loan_amount ?? car.bank_loan}
                        bankName={car.bank_name}
                        hasBankLoan={car.has_bank_loan}
                        lang={lang}
                        size="md"
                      />

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Telegram Instant Share */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTelegramShare(car, dealership?.name);
                          }}
                          className="py-1.5 px-2 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#45B6ED] hover:text-white border border-[#229ED9]/30 rounded-xl text-xs font-semibold transition flex items-center gap-1 shadow-sm active:scale-95"
                          title={lang === "am" ? "በቴሌግራም አጋራ" : "Share on Telegram"}
                        >
                          <TelegramIcon size={13} />
                          <span className="hidden sm:inline">{lang === "am" ? "አጋራ" : "Share"}</span>
                        </button>

                        {/* Compare Toggle Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCompare(car);
                          }}
                          className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 ${
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

                        {/* If Sold -> Telegram Link; Otherwise -> Book Visit modal */}
                        {car.status === "Sold" ? (
                          <a
                            href={`https://t.me/EliteMotorsAlert_bot?text=${encodeURIComponent(
                              `ሰላም! የ${car.year} ${car.make} ${car.model} ተሽጧል የሚል አየሁ። እባካችሁ ተመሳሳይ መኪና ፈልጉልኝ።`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="py-1.5 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-semibold transition flex items-center gap-1"
                          >
                            {t.findSimilar}
                          </a>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBookingVehicle(car);
                            }}
                            className="py-1.5 px-2.5 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black border border-amber-500/30 rounded-xl text-xs font-semibold transition flex items-center gap-1"
                          >
                            {lang === "am" ? "ቀጠሮ" : "Book"}{" "}
                            <ArrowRight size={13} />
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
      />

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
