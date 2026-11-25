"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Building2,
  Car,
  Key,
  Users,
  TrendingUp,
  UserCheck,
  Send,
  Phone,
  RotateCw,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Truck,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Sparkles,
  LayoutDashboard,
  Archive,
  Settings,
} from "lucide-react";
import { User, ExecutiveStats, RentalBooking } from "@/types";
import AdminDashboard from "@/components/admin/AdminDashboard";
import StaffManager from "@/components/admin/StaffManager";
import DocumentCenter from "@/components/documents/DocumentCenter";
import { getApiBaseUrl } from "@/lib/api";
import { resolveImageUrl } from "@/lib/images";

const RENTAL_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  driver_assigned: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  delivered: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

type HubSection = "overview" | "documents" | "settings" | "rentals" | "staff";

const HUB_SECTIONS: { id: HubSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "documents", label: "Documents", icon: Archive },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "rentals", label: "Rental Deliveries", icon: Truck },
  { id: "staff", label: "Staff", icon: Users },
];

// Settings is the last desk still served by the shared AdminDashboard (owner portal).
const OWNER_DESKS: HubSection[] = ["settings"];

export default function ExecutiveOwnerDashboard() {
  const router = useRouter();

  // Section navigation (kept in ?section= so a refresh or a shared link reopens the same desk).
  // Reading window here is safe: until the role check finishes only the loader is rendered.
  const [section, setSection] = useState<HubSection>(() => {
    if (typeof window === "undefined") return "overview";
    let wanted = new URLSearchParams(window.location.search).get("section");
    // Old links to the separate lot desk now open the Document Center.
    if (wanted === "lot_operations") wanted = "documents";
    return HUB_SECTIONS.some((h) => h.id === wanted) ? (wanted as HubSection) : "overview";
  });
  // Owner desks stay mounted once opened, so switching sections doesn't refetch or drop a half-filled form.
  const [deskOpened, setDeskOpened] = useState(() => OWNER_DESKS.includes(section));
  const selectSection = (id: HubSection) => {
    setSection(id);
    if (OWNER_DESKS.includes(id)) setDeskOpened(true);
  };
  useEffect(() => {
    const url = new URL(window.location.href);
    if (section === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", section);
    window.history.replaceState(null, "", url.toString());
    const el = document.querySelector<HTMLElement>(`[data-hub-tab="${section}"]`);
    const row = el?.parentElement;
    if (el && row && row.scrollWidth > row.clientWidth) {
      row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [section]);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Executive Data State
  const [stats, setStats] = useState<ExecutiveStats | null>(null);
  const [rentals, setRentals] = useState<RentalBooking[]>([]);
  const [loading, setLoading] = useState(true);

  // Toasts
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const getAuthToken = () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dealer_token") || localStorage.getItem("token");
    }
    return null;
  };

  // 1. RBAC Guard: Verify SuperAdmin / Executive Role
  useEffect(() => {
    const checkRole = async () => {
      const token = getAuthToken();
      if (!token) {
        router.push("/admin");
        return;
      }

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/admin/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          router.push("/admin");
          return;
        }

        const user: User = await res.json();
        // The backend decides from its SUPERADMIN_PHONE list; no phone numbers live in the UI.
        const isSuperadminUser = user.is_superadmin === true;

        if (!isSuperadminUser) {
          router.push("/admin");
          return;
        }

        setCurrentUser(user);
        setAuthChecking(false);
      } catch (err) {
        console.error("Auth verification failed", err);
        router.push("/admin");
      }
    };

    checkRole();
  }, [router]);

  // 2. Load Executive Owner Dashboard Data
  const fetchDashboardData = async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, rentalsRes] = await Promise.all([
        fetch(`${getApiBaseUrl()}/api/admin/stats`, { headers })
          .then((r) => (r.ok ? r : fetch(`${getApiBaseUrl()}/api/superadmin/stats`, { headers })))
          .then((r) => (r.ok ? r : fetch(`${getApiBaseUrl()}/api/superadmin/executive-stats`, { headers }))),
        fetch(`${getApiBaseUrl()}/api/admin/rentals`, { headers }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (rentalsRes.ok) {
        const rentalsData = await rentalsRes.json();
        setRentals(Array.isArray(rentalsData) ? rentalsData : []);
      }
    } catch (err) {
      console.error("Failed to load Executive Dashboard data", err);
      showToast("Error loading executive metrics", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecking && currentUser) {
      fetchDashboardData();
    }
  }, [authChecking, currentUser]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 font-medium">Verifying AC Wale Cars Executive Credentials...</p>
      </div>
    );
  }

  const telegramConnectUrl = "https://t.me/WagaCarsAlert_bot?start=connect_1";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-semibold transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${
            toast.type === "success"
              ? "bg-zinc-900 text-emerald-400 border-emerald-500/30"
              : "bg-zinc-900 text-rose-400 border-rose-500/30"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top Executive Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md px-4 sm:px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="p-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-400 hover:text-white transition"
              title="Return to Dealer Showroom Admin"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <ShieldCheck size={12} /> AC WALE MARKET • EXECUTIVE HUB
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  ac_wale_cars.db (Isolated)
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
                AC WALE MARKET <span className="text-amber-500">Master Business Hub</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 1-Click Connect Telegram Shortcut */}
            <a
              href={telegramConnectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] md:min-h-0 px-3.5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 font-semibold text-xs flex items-center gap-1.5 transition"
              title="Connect Official Notification Bot"
            >
              <Send size={14} /> ቴሌግራም አገናኝ (Connect Bot)
            </a>

            {/* Refresh Data */}
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="p-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-50"
              title="Refresh Business Metrics"
            >
              <RotateCw size={16} className={loading ? "animate-spin text-amber-400" : ""} />
            </button>

            {/* Public Showroom Link */}
            <Link
              href="/"
              target="_blank"
              className="min-h-[44px] md:min-h-0 px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-medium text-xs flex items-center gap-1.5 transition"
            >
              <span>ሾውሩም ጎብኝ (Showroom)</span>
              <ExternalLink size={12} />
            </Link>

            {/* Admin Operations */}
            <Link
              href="/admin"
              className="min-h-[44px] md:min-h-0 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition"
            >
              <span>የስራ አስተዳደር (Operations)</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* Section navigation: Overview | Documents | Settings | Rentals | Staff */}
      <nav
        role="tablist"
        aria-label="Owner hub sections"
        className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex gap-2 overflow-x-auto no-scrollbar snap-x scroll-px-4">
          {HUB_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              data-hub-tab={id}
              aria-selected={section === id}
              onClick={() => selectSection(id)}
              className={`shrink-0 snap-start h-11 px-3.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 whitespace-nowrap ${
                section === id
                  ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
              }`}
            >
              <Icon size={14} className="shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Owner desks (same components as the old /admin tabs; backend allows superadmin only) */}
      {deskOpened && (
        <div className={OWNER_DESKS.includes(section) ? "max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-8 pb-24" : "hidden"}>
          <AdminDashboard
            portal="owner"
            ownerSection="settings"
          />
        </div>
      )}

      {/* Main Content Area */}
      <main className={OWNER_DESKS.includes(section) ? "hidden" : "max-w-7xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-8 flex-1 space-y-8"}>
        {/* 4 KEY EXECUTIVE METRIC CARDS */}
        <section className={section === "overview" ? "" : "hidden"}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" /> ዋና ዋና የንግድ አመልካቾች (Executive Key Metrics)
            </h2>
            <span className="text-xs text-zinc-500">Live Single-Tenant Metrics</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Sales Inventory */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/40 transition shadow-xl group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Total Sales Inventory
                </span>
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition">
                  <Car size={20} />
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {loading ? "..." : (stats?.sales_count ?? stats?.sales_inventory ?? stats?.total_sales_inventory ?? 0)}
              </div>
              <div className="text-xs text-zinc-400 mt-1 font-medium">
                የሚሸጡ መኪኖች (Cars for Sale)
              </div>
            </div>

            {/* Card 2: Active Rental Fleet */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-sky-500/40 transition shadow-xl group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Active Rental Fleet
                </span>
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-110 transition">
                  <Key size={20} />
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {loading ? "..." : (stats?.rental_count ?? stats?.rental_fleet ?? stats?.active_rental_fleet ?? 0)}
              </div>
              <div className="text-xs text-zinc-400 mt-1 font-medium">
                የኪራይ መኪኖች (Ready for Dispatch)
              </div>
            </div>

            {/* Card 3: Registered Drivers */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/40 transition shadow-xl group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Registered Drivers
                </span>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition">
                  <Truck size={20} />
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {loading ? "..." : (stats?.drivers_count ?? stats?.active_drivers ?? stats?.registered_drivers ?? 0)}
              </div>
              <div className="text-xs text-zinc-400 mt-1 font-medium">
                ተረካቢ አሽከርካሪዎች (Active Personnel)
              </div>
            </div>

            {/* Card 4: Total Customer Inquiries & Rental Bookings */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-purple-500/40 transition shadow-xl group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Total Leads & Bookings
                </span>
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-110 transition">
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {loading ? "..." : (stats?.leads_count ?? stats?.total_inquiries_and_bookings ?? stats?.total_leads_bookings ?? 0)}
              </div>
              <div className="text-xs text-zinc-400 mt-1 font-medium">
                {stats?.total_sales_inquiries != null
                  ? `${stats.total_sales_inquiries} ቀጠሮዎች • ${stats?.total_rental_bookings ?? 0} ኪራዮች`
                  : `${stats?.leads_count ?? 0} ጠቅላላ ጥያቄዎች እና ኪራዮች`}
              </div>
            </div>
          </div>
        </section>

        {/* OPERATIONAL TABLE 1: RECENT RENTAL DELIVERIES & DRIVER ASSIGNMENTS */}
        <section className={`bg-zinc-900/80 border border-zinc-800/90 rounded-2xl overflow-hidden shadow-2xl ${section === "rentals" ? "" : "hidden"}`}>
          <div className="p-6 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Key size={16} />
                </span>
                <h3 className="text-base font-bold text-white tracking-tight">
                  የቅርብ የመኪና ኪራይ እና የአሽከርካሪ ስምሪት (Recent Rental Deliveries & Dispatch)
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Active customer bookings, delivery locations across Addis Ababa, and assigned drivers.
              </p>
            </div>
            <Link
              href="/admin"
              className="min-h-[44px] sm:min-h-0 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition self-start sm:self-auto"
            >
              <span>ሁሉንም ኪራዮች አስተዳድር (Manage Rentals)</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-zinc-500">
                <RotateCw size={24} className="animate-spin mx-auto mb-2 text-zinc-400" />
                Loading rental pipeline...
              </div>
            ) : rentals.length === 0 ? (
              <div className="p-12 text-center">
                <Key size={36} className="mx-auto text-zinc-600 mb-3" />
                <h4 className="text-sm font-bold text-white">ምንም የኪራይ ትዕዛዝ የለም (No Active Rentals)</h4>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  ደንበኞች በሾውሩም በኩል መኪና ሲከራዩ ትዕዛዞች እዚህ በቅጽበት ይዘረዘራሉ::
                </p>
              </div>
            ) : (
              <>
              {/* Phones: stacked cards */}
              <ul className="sm:hidden divide-y divide-zinc-800/60">
                {rentals.slice(0, 8).map((booking) => (
                  <li key={booking.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm break-words">
                          {booking.vehicle ? `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}` : `Vehicle #${booking.vehicle_id}`}
                        </div>
                        <div className="text-xs text-zinc-400">Booking #{booking.id} · {booking.total_days} ቀን (Days) · {new Date(booking.start_date).toLocaleDateString()}</div>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-full text-[11px] font-bold border uppercase ${RENTAL_STATUS_COLORS[booking.status] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}>
                        {booking.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-200 truncate">{booking.customer_name}</div>
                        <a href={`tel:${booking.customer_phone}`} className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-amber-400">
                          <Phone size={14} /> {booking.customer_phone}
                        </a>
                      </div>
                      <div className="shrink-0 font-mono font-bold text-white text-sm">{booking.total_price.toLocaleString()} ETB</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`px-2 py-1 rounded font-bold ${booking.delivery_type === "doorstep_delivery" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-zinc-800 text-zinc-300"}`}>
                        {booking.delivery_type === "doorstep_delivery" ? "🚚 ያሉበት ድረስ" : "🏢 ከሾውሩም"}
                      </span>
                      {booking.assigned_driver ? (
                        <span className="flex items-center gap-1 text-white font-semibold">
                          <UserCheck size={13} className="text-emerald-400" /> {booking.assigned_driver.full_name}
                        </span>
                      ) : (
                        <span className="text-amber-400/80 italic flex items-center gap-1"><Clock size={12} /> አልተመደበም (Unassigned)</span>
                      )}
                    </div>
                    {booking.delivery_address && (
                      <div className="text-xs text-zinc-400 break-words">📍 {booking.delivery_address}</div>
                    )}
                  </li>
                ))}
              </ul>
              <table className="hidden sm:table w-full text-left text-sm text-zinc-300">
                <thead className="bg-zinc-950/60 border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">መኪና (Vehicle)</th>
                    <th className="px-6 py-3.5">ደንበኛ (Customer)</th>
                    <th className="px-6 py-3.5">የኪራይ ጊዜ (Period)</th>
                    <th className="px-6 py-3.5">ማድረሻ (Delivery)</th>
                    <th className="px-6 py-3.5">የተመደበ አሽከርካሪ (Driver)</th>
                    <th className="px-6 py-3.5">ሁኔታ (Status)</th>
                    <th className="px-6 py-3.5 text-right">ዋጋ (Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {rentals.slice(0, 8).map((booking) => {
                    const statusColors = RENTAL_STATUS_COLORS;

                    return (
                      <tr key={booking.id} className="hover:bg-zinc-800/40 transition">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">
                            {booking.vehicle ? `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}` : `Vehicle #${booking.vehicle_id}`}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            Booking #{booking.id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-zinc-200">{booking.customer_name}</div>
                          <a
                            href={`tel:${booking.customer_phone}`}
                            className="text-xs text-amber-400 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <Phone size={11} /> {booking.customer_phone}
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-zinc-300 font-medium">
                            {booking.total_days} ቀን (Days)
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {new Date(booking.start_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              booking.delivery_type === "doorstep_delivery"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {booking.delivery_type === "doorstep_delivery" ? "🚚 ያሉበት ድረስ" : "🏢 ከሾውሩም"}
                          </span>
                          {booking.delivery_address && (
                            <div className="text-[11px] text-zinc-400 mt-1 truncate max-w-[150px]">
                              📍 {booking.delivery_address}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {booking.assigned_driver ? (
                            <div>
                              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                                <UserCheck size={13} className="text-emerald-400" />
                                {booking.assigned_driver.full_name}
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                {booking.assigned_driver.phone_number}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-400/80 italic flex items-center gap-1">
                              <Clock size={12} /> አልተመደበም (Unassigned)
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
                              statusColors[booking.status] || "bg-zinc-800 text-zinc-300 border-zinc-700"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-white">
                          {booking.total_price.toLocaleString()} ETB
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </div>
        </section>

        {/* DOCUMENTS: one Document Center for all five document types (owner-only API) */}
        {section === "documents" && (
          <div className="max-w-5xl mx-auto w-full">
            <DocumentCenter userName={currentUser?.full_name || ""} />
          </div>
        )}

        {/* STAFF: add / edit / permissions / active toggle (owner-only API) */}
        {section === "staff" && <StaffManager />}
      </main>

    </div>
  );
}
