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
  Plus,
  Trash2,
  X,
  AlertTriangle,
  UserPlus,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { User, ExecutiveStats, StaffUser, RentalBooking } from "@/types";
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

export default function ExecutiveOwnerDashboard() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Executive Data State
  const [stats, setStats] = useState<ExecutiveStats | null>(null);
  const [rentals, setRentals] = useState<RentalBooking[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite/Add Staff Modal
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffPhone, setStaffPhone] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("sales_agent");
  const [isSavingStaff, setIsSavingStaff] = useState(false);

  // Action Loading & Toasts
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
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
        const superadminPhone1 = "251918032065";
        const superadminPhone2 = "251911646628";
        const normalizedUserPhone = (user.phone_number || "").replace(/\D/g, "");

        const isSuperadminUser =
          user.role === "superadmin" ||
          Boolean((user as any).is_superadmin) ||
          normalizedUserPhone.includes(superadminPhone1) ||
          normalizedUserPhone.includes(superadminPhone2);

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

      const [statsRes, rentalsRes, staffRes] = await Promise.all([
        fetch(`${getApiBaseUrl()}/api/admin/stats`, { headers })
          .then((r) => (r.ok ? r : fetch(`${getApiBaseUrl()}/api/superadmin/stats`, { headers })))
          .then((r) => (r.ok ? r : fetch(`${getApiBaseUrl()}/api/superadmin/executive-stats`, { headers }))),
        fetch(`${getApiBaseUrl()}/api/admin/rentals`, { headers }),
        fetch(`${getApiBaseUrl()}/api/superadmin/staff`, { headers }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (rentalsRes.ok) {
        const rentalsData = await rentalsRes.json();
        setRentals(Array.isArray(rentalsData) ? rentalsData : []);
      }

      if (staffRes.ok) {
        const staffData = await staffRes.json();
        setStaffList(Array.isArray(staffData) ? staffData : []);
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

  // 3. Add or Invite Staff Member
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAuthToken();
    if (!token) return;

    if (!staffPhone.trim()) {
      showToast("Please enter a valid phone number", "error");
      return;
    }

    setIsSavingStaff(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/superadmin/staff`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: staffPhone.trim(),
          full_name: staffName.trim() || null,
          role: staffRole,
        }),
      });

      if (res.ok) {
        const createdUser: StaffUser = await res.json();
        setStaffList((prev) => [createdUser, ...prev.filter((u) => u.id !== createdUser.id)]);
        showToast(`✓ Staff member ${createdUser.full_name || createdUser.phone_number} successfully registered!`);
        setIsStaffModalOpen(false);
        setStaffPhone("");
        setStaffName("");
        setStaffRole("sales_agent");
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to invite staff member", "error");
      }
    } catch (err) {
      console.error("Error inviting staff", err);
      showToast("Network error inviting staff member", "error");
    } finally {
      setIsSavingStaff(false);
    }
  };

  // 4. Toggle Staff Active / Inactive Status
  const handleToggleStaffStatus = async (staff: StaffUser) => {
    const token = getAuthToken();
    if (!token) return;

    setActionLoadingId(staff.id);
    const newStatus = !staff.is_active;

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/superadmin/staff/${staff.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (res.ok) {
        const updated: StaffUser = await res.json();
        setStaffList((prev) => prev.map((s) => (s.id === staff.id ? updated : s)));
        showToast(
          newStatus
            ? `✓ Staff member ${staff.full_name || staff.phone_number} activated.`
            : `⚠️ Staff member ${staff.full_name || staff.phone_number} deactivated.`,
          newStatus ? "success" : "error"
        );
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to update staff status", "error");
      }
    } catch (err) {
      console.error("Staff status error", err);
      showToast("Network error updating staff", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // 5. Delete Staff Member
  const handleDeleteStaff = async (staffId: number, staffName: string) => {
    if (!confirm(`Are you sure you want to remove staff member '${staffName}'?`)) return;
    const token = getAuthToken();
    if (!token) return;

    setActionLoadingId(staffId);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/superadmin/staff/${staffId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setStaffList((prev) => prev.filter((s) => s.id !== staffId));
        showToast("✓ Staff member deleted successfully");
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to delete staff member", "error");
      }
    } catch (err) {
      console.error("Delete staff error", err);
      showToast("Network error deleting staff member", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

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
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
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

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full px-6 py-8 flex-1 space-y-8">
        {/* 4 KEY EXECUTIVE METRIC CARDS */}
        <section>
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
        <section className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl overflow-hidden shadow-2xl">
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

        {/* OPERATIONAL TABLE 2: STAFF MANAGEMENT */}
        <section className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Users size={16} />
                </span>
                <h3 className="text-base font-bold text-white tracking-tight">
                  የሰራተኞች አስተዳደር (Staff Management & Authorized Access)
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Executive Owner, Sub-Admins, and Sales Representatives authorized to manage AC Wale Cars.
              </p>
            </div>

            <button
              onClick={() => setIsStaffModalOpen(true)}
              className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition self-start sm:self-auto"
            >
              <UserPlus size={15} />
              <span>+ ሰራተኛ ጨምር (Invite Staff)</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-zinc-500">
                <RotateCw size={24} className="animate-spin mx-auto mb-2 text-zinc-400" />
                Loading staff roster...
              </div>
            ) : staffList.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">
                No staff members recorded.
              </div>
            ) : (
              <>
              {/* Phones: stacked cards */}
              <ul className="sm:hidden divide-y divide-zinc-800/60">
                {staffList.map((staff) => {
                  const isSuperAdmin = staff.role === "superadmin" || staff.phone_number.includes("251918032065");
                  return (
                    <li key={staff.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-white text-sm flex items-center gap-2 break-words">
                            {isSuperAdmin && <ShieldCheck size={14} className="shrink-0 text-amber-400" />}
                            {staff.full_name || "AC Wale Staff Member"}
                          </div>
                          <div className="text-xs text-zinc-400 font-mono">+{staff.phone_number.replace(/^\+/, "")}</div>
                          <div className="text-xs text-zinc-500">ID #{staff.id} · {new Date(staff.created_at).toLocaleDateString()}</div>
                        </div>
                        <span className={`shrink-0 px-2 py-1 rounded text-[11px] font-bold ${staff.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                          {staff.is_active ? "✓ Active" : "✕ Suspended"}
                        </span>
                      </div>
                      <div>
                        {isSuperAdmin ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">👑 Executive Owner</span>
                        ) : staff.role === "subadmin" ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">🛡️ Sub-Admin</span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">👤 Sales Agent</span>
                        )}
                      </div>
                      {isSuperAdmin ? (
                        <p className="text-xs text-zinc-500 italic">Protected Master Account</p>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggleStaffStatus(staff)}
                            disabled={actionLoadingId === staff.id}
                            className={`flex-1 min-h-[44px] px-3 rounded-xl text-sm font-bold transition ${staff.is_active ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}
                          >
                            {staff.is_active ? "አግድ (Suspend)" : "አንቃ (Activate)"}
                          </button>
                          <button
                            onClick={() => handleDeleteStaff(staff.id, staff.full_name || staff.phone_number)}
                            disabled={actionLoadingId === staff.id}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-rose-400 transition"
                            aria-label="Delete Staff Member"
                            title="Delete Staff Member"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <table className="hidden sm:table w-full text-left text-sm text-zinc-300">
                <thead className="bg-zinc-950/60 border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">ሰራተኛ (Staff Member)</th>
                    <th className="px-6 py-3.5">ስልክ ቁጥር (Phone)</th>
                    <th className="px-6 py-3.5">ሚና (Role)</th>
                    <th className="px-6 py-3.5">ሁኔታ (Status)</th>
                    <th className="px-6 py-3.5">የተመዘገበበት ቀን (Joined)</th>
                    <th className="px-6 py-3.5 text-right">እርምጃዎች (Actions)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {staffList.map((staff) => {
                    const isSuperAdmin = staff.role === "superadmin" || staff.phone_number.includes("251918032065");

                    return (
                      <tr key={staff.id} className="hover:bg-zinc-800/40 transition">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            {isSuperAdmin && <ShieldCheck size={14} className="text-amber-400" />}
                            {staff.full_name || "AC Wale Staff Member"}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono">
                            ID #{staff.id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-zinc-300 text-xs">
                            +{staff.phone_number.replace(/^\+/, "")}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {isSuperAdmin ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              👑 Executive Owner
                            </span>
                          ) : staff.role === "subadmin" ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              🛡️ Sub-Admin
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              👤 Sales Agent
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              staff.is_active
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {staff.is_active ? "✓ Active" : "✕ Suspended"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-400">
                          {new Date(staff.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isSuperAdmin ? (
                            <span className="text-[11px] text-zinc-500 italic">Protected Master Account</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleStaffStatus(staff)}
                                disabled={actionLoadingId === staff.id}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                  staff.is_active
                                    ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                                }`}
                              >
                                {staff.is_active ? "አግድ (Suspend)" : "አንቃ (Activate)"}
                              </button>
                              <button
                                onClick={() => handleDeleteStaff(staff.id, staff.full_name || staff.phone_number)}
                                disabled={actionLoadingId === staff.id}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition"
                                title="Delete Staff Member"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
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
      </main>

      {/* INVITE / ADD STAFF MODAL */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsStaffModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <UserPlus size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  አዲስ ሰራተኛ ጨምር (Invite Staff Member)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Grant authorized administrative access to AC Wale Cars.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
                  የስልክ ቁጥር (Ethiopian Mobile Number) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-xs">+251</span>
                  <input
                    type="tel"
                    required
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    placeholder="911 234 567"
                    className="w-full pl-14 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  The staff member will login using OTP verification to this phone number.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
                  ሙሉ ስም (Full Name)
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Dawit Tadesse"
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
                  የስራ ሚና (System Role)
                </label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 transition"
                >
                  <option value="sales_agent">Sales Representative (የሽያጭ ተወካይ)</option>
                  <option value="subadmin">Sub-Admin / Manager (ረዳት አስተዳዳሪ)</option>
                  <option value="dealer_admin">Showroom Admin (የሾውሩም አስተዳዳሪ)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition"
                >
                  Cancel (ይቅር)
                </button>
                <button
                  type="submit"
                  disabled={isSavingStaff}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {isSavingStaff ? (
                    <>
                      <RotateCw size={14} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>ፈቃድ ስጥ (Grant Access)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
