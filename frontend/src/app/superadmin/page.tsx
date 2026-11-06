"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  Building2,
  Car,
  TrendingUp,
  Users,
  Search,
  ExternalLink,
  Power,
  RotateCw,
  ArrowLeft,
  Sliders,
  CheckCircle2,
  XCircle,
  Phone,
  Sparkles,
  CarFront,
  Edit3,
  X,
  AlertTriangle,
  Trash2,
  LogIn,
} from "lucide-react";
import { User, SuperAdminStats, SuperAdminDealership } from "@/types";
import { getApiBaseUrl } from "@/lib/api";
import { resolveImageUrl } from "@/lib/images";

export default function SuperAdminDashboard() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [stats, setStats] = useState<SuperAdminStats | null>(null);
  const [dealerships, setDealerships] = useState<SuperAdminDealership[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Edit Plan & Capacity Modal state
  const [editingDealer, setEditingDealer] = useState<SuperAdminDealership | null>(null);
  const [editPlan, setEditPlan] = useState<string>("starter");
  const [editMaxVehicles, setEditMaxVehicles] = useState<number>(50);
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Cascade Delete Dealership Modal state
  const [dealerToDelete, setDealerToDelete] = useState<SuperAdminDealership | null>(null);
  const [isDeletingDealer, setIsDeletingDealer] = useState(false);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const getAuthToken = () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dealer_token");
    }
    return null;
  };

  // 1. RBAC Guard: Verify SuperAdmin Role
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
        if (user.role !== "superadmin") {
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

  // 2. Fetch SuperAdmin Data
  const fetchSuperAdminData = async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, dealersRes] = await Promise.all([
        fetch(`${getApiBaseUrl()}/api/superadmin/stats`, { headers }),
        fetch(`${getApiBaseUrl()}/api/superadmin/dealerships`, { headers }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (dealersRes.ok) {
        const dealersData = await dealersRes.json();
        setDealerships(Array.isArray(dealersData) ? dealersData : []);
      }
    } catch (err) {
      console.error("Failed to load SuperAdmin metrics", err);
      showToast("Error loading SuperAdmin data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecking && currentUser?.role === "superadmin") {
      fetchSuperAdminData();
    }
  }, [authChecking, currentUser]);

  // 3. Toggle Dealership Active / Inactive Status
  const handleToggleStatus = async (dealer: SuperAdminDealership) => {
    const token = getAuthToken();
    if (!token) return;

    const newStatus = !dealer.is_active;
    setActionLoadingId(dealer.id);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/superadmin/dealerships/${dealer.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (res.ok) {
        const updated: SuperAdminDealership = await res.json();
        setDealerships((prev) =>
          prev.map((d) => (d.id === dealer.id ? { ...d, is_active: updated.is_active } : d))
        );
        showToast(
          newStatus
            ? `✓ Showroom '${dealer.name}' is now ACTIVE and visible to public.`
            : `⚠️ Showroom '${dealer.name}' is now SUSPENDED. All public access paused.`,
          newStatus ? "success" : "error"
        );
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to update dealership status", "error");
      }
    } catch (err) {
      console.error("Status toggle error", err);
      showToast("Network error updating status", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // 4. Open Edit Plan Modal
  const openEditPlanModal = (dealer: SuperAdminDealership) => {
    setEditingDealer(dealer);
    setEditPlan(dealer.subscription_plan || "starter");
    setEditMaxVehicles(dealer.max_vehicles || 50);
  };

  // 5. Save Subscription Plan & Capacity
  const handleSavePlan = async () => {
    if (!editingDealer) return;
    const token = getAuthToken();
    if (!token) return;

    setIsSavingPlan(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/superadmin/dealerships/${editingDealer.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription_plan: editPlan,
          max_vehicles: editMaxVehicles,
        }),
      });

      if (res.ok) {
        const updated: SuperAdminDealership = await res.json();
        setDealerships((prev) =>
          prev.map((d) => (d.id === editingDealer.id ? { ...d, ...updated } : d))
        );
        showToast(`✓ Updated plan for '${editingDealer.name}' to ${editPlan.toUpperCase()} (${editMaxVehicles} cars).`);
        setEditingDealer(null);
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to update plan", "error");
      }
    } catch (err) {
      console.error("Plan save error", err);
      showToast("Network error updating subscription plan", "error");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleConfirmDeleteDealer = async (dealerId: number) => {
    setIsDeletingDealer(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/api/admin/dealerships/${dealerId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to delete dealership");
      }

      showToast("ሾውሩሙ በተሳካ ሁኔታ ተሰርዟል (Dealership deleted)", "success");
      setDealerToDelete(null);

      // Refresh list & stats
      setDealerships((prev) => prev.filter((d) => d.id !== dealerId));
      fetchSuperAdminData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete dealership", "error");
    } finally {
      setIsDeletingDealer(false);
    }
  };

  const [isSwitchingDealer, setIsSwitchingDealer] = useState<number | null>(null);

  const handleImpersonateDealership = async (dealer: SuperAdminDealership) => {
    setIsSwitchingDealer(dealer.id);
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/api/admin/switch-dealership`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dealership_id: dealer.id }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          localStorage.setItem("token", data.access_token);
          localStorage.setItem("dealer_token", data.access_token);
        }
        localStorage.setItem("dealership", JSON.stringify(data.dealership || dealer));
        showToast(`✓ ወደ '${dealer.name}' ተቀይሯል (Managing ${dealer.name})`, "success");
        router.push("/admin");
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to switch dealership", "error");
      }
    } catch (err: any) {
      showToast("Network error switching dealership", "error");
    } finally {
      setIsSwitchingDealer(null);
    }
  };

  // Filtered Dealerships List
  const filteredDealerships = useMemo(() => {
    return dealerships.filter((d) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.slug.toLowerCase().includes(q) ||
        (d.phone_number && d.phone_number.includes(q)) ||
        (d.user_phone_number && d.user_phone_number.includes(q));

      const matchesPlan = planFilter === "all" || d.subscription_plan === planFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && d.is_active) ||
        (statusFilter === "suspended" && !d.is_active);

      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [dealerships, searchQuery, planFilter, statusFilter]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono text-zinc-400">Verifying SuperAdmin Credentials...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24 selection:bg-purple-600 selection:text-white">
      {/* Top SuperAdmin Navigation Bar */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-purple-900/40 px-4 py-3 shadow-lg shadow-purple-950/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-xl transition"
              title="Return to Dealer Dashboard"
            >
              <ArrowLeft size={16} />
            </Link>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center shadow-md shadow-purple-500/20">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wide text-white uppercase flex items-center gap-2">
                  <span>AutoShowroom SuperAdmin</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Master Oversight
                  </span>
                </h1>
                <p className="text-[11px] text-zinc-400">
                  Platform-wide Oversight, Monetization & Tenant Controls
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchSuperAdminData}
              disabled={loading}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 transition flex items-center gap-1.5"
            >
              <RotateCw size={14} className={loading ? "animate-spin text-purple-400" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1 bg-purple-950/40 border border-purple-800/60 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-purple-200">
                {currentUser?.phone_number}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-6 space-y-6">
        {/* Top Metrics Cards (4 columns) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Showrooms */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 hover:border-purple-500/50 transition shadow-md">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Showrooms</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Building2 size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-white">
              {stats ? stats.total_dealerships : "..."}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Multi-tenant dealer showrooms registered</p>
          </div>

          {/* Active Listings */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 hover:border-emerald-500/50 transition shadow-md">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Active Inventory</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Car size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {stats ? stats.total_active_listings : "..."}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Cars available for sale across Addis</p>
          </div>

          {/* Platform Inventory Value */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 hover:border-amber-500/50 transition shadow-md">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Platform Value (ETB)</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight truncate">
              {stats ? `${stats.total_inventory_value.toLocaleString()} ETB` : "..."}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Aggregate gross value of showroom stock</p>
          </div>

          {/* Total Leads Generated */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 hover:border-sky-500/50 transition shadow-md">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Customer Leads</span>
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Users size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-sky-400">
              {stats ? stats.total_leads_generated : "..."}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Total buyer test-drive & viewing inquiries</p>
          </div>
        </section>

        {/* Filter & Search Bar */}
        <section className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by name, slug, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-purple-500 pl-9 pr-3 py-2 rounded-xl text-xs text-white placeholder-zinc-500 outline-none transition"
            />
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Status Filter */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-lg transition font-medium ${
                  statusFilter === "all" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                }`}
              >
                All Status
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1 rounded-lg transition font-medium ${
                  statusFilter === "active" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-400 hover:text-white"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter("suspended")}
                className={`px-3 py-1 rounded-lg transition font-medium ${
                  statusFilter === "suspended" ? "bg-red-500/20 text-red-400" : "text-zinc-400 hover:text-white"
                }`}
              >
                Suspended
              </button>
            </div>

            {/* Plan Filter */}
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-purple-500 transition"
            >
              <option value="all">All Plans</option>
              <option value="starter">Starter Plan</option>
              <option value="pro">Pro Plan</option>
              <option value="enterprise">Enterprise Plan</option>
            </select>
          </div>
        </section>

        {/* Dealerships Master Table */}
        <section className="bg-zinc-950 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 size={16} className="text-purple-400" />
              <span>Registered Dealerships & Showrooms ({filteredDealerships.length})</span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 text-zinc-400 border-b border-zinc-800 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Showroom</th>
                  <th className="py-3 px-4">Contact & Account</th>
                  <th className="py-3 px-4 text-center">Cars / Limit</th>
                  <th className="py-3 px-4 text-center">Subscription</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredDealerships.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-500">
                      No dealerships found matching the current search & filters.
                    </td>
                  </tr>
                ) : (
                  filteredDealerships.map((dealer) => {
                    const isSuspended = !dealer.is_active;
                    const isActionLoading = actionLoadingId === dealer.id;

                    return (
                      <tr
                        key={dealer.id}
                        className={`hover:bg-zinc-900/40 transition ${
                          isSuspended ? "opacity-75 bg-red-950/10" : ""
                        }`}
                      >
                        {/* Showroom Logo & Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {dealer.logo_url ? (
                              <img
                                src={resolveImageUrl(dealer.logo_url)}
                                alt={dealer.name}
                                className="w-9 h-9 rounded-xl object-cover border border-zinc-700 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 flex-shrink-0">
                                <CarFront size={18} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="font-bold text-white block truncate max-w-[180px]">
                                {dealer.name}
                              </span>
                              <span className="font-mono text-[11px] text-zinc-500 block truncate max-w-[180px]">
                                /{dealer.slug}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Contact & Phone */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                              <Phone size={12} className="text-zinc-500" />
                              {dealer.phone_number || "No contact phone"}
                            </span>
                            {dealer.user_phone_number && (
                              <span className="text-[10px] text-zinc-500 block font-mono">
                                Login: {dealer.user_phone_number}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Inventory Count vs Max Vehicles */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-bold text-white">
                            {dealer.vehicle_count}
                          </span>
                          <span className="text-zinc-500 text-[11px]">
                            {" "}/ {dealer.max_vehicles}
                          </span>
                        </td>

                        {/* Subscription Plan */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => openEditPlanModal(dealer)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border transition hover:scale-105 active:scale-95 shadow-sm"
                            style={{
                              backgroundColor:
                                dealer.subscription_plan === "enterprise"
                                  ? "rgba(168, 85, 247, 0.15)"
                                  : dealer.subscription_plan === "pro"
                                  ? "rgba(59, 130, 246, 0.15)"
                                  : "rgba(113, 113, 122, 0.15)",
                              borderColor:
                                dealer.subscription_plan === "enterprise"
                                  ? "rgba(168, 85, 247, 0.4)"
                                  : dealer.subscription_plan === "pro"
                                  ? "rgba(59, 130, 246, 0.4)"
                                  : "rgba(113, 113, 122, 0.4)",
                              color:
                                dealer.subscription_plan === "enterprise"
                                  ? "#c084fc"
                                  : dealer.subscription_plan === "pro"
                                  ? "#60a5fa"
                                  : "#a1a1aa",
                            }}
                            title="Click to upgrade or edit subscription plan"
                          >
                            <span>{dealer.subscription_plan || "starter"}</span>
                            <Edit3 size={10} />
                          </button>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4 text-center">
                          {dealer.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 size={11} />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                              <XCircle size={11} />
                              <span>Suspended</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Dealer Impersonation / Jump In */}
                            <button
                              onClick={() => handleImpersonateDealership(dealer)}
                              disabled={isSwitchingDealer === dealer.id}
                              className="px-2.5 py-1.5 bg-purple-500/10 hover:bg-purple-500 text-purple-300 hover:text-white border border-purple-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
                              title={`Jump into and manage '${dealer.name}' inventory`}
                            >
                              <LogIn size={13} className={isSwitchingDealer === dealer.id ? "animate-spin" : ""} />
                              <span>{isSwitchingDealer === dealer.id ? "Switching..." : "Manage"}</span>
                            </button>

                            {/* Direct Showroom Preview Link */}
                            <a
                              href={`/?dealer=${dealer.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl transition"
                              title="Inspect Public Showroom in new tab"
                            >
                              <ExternalLink size={14} />
                            </a>

                            {/* One-click Deactivate / Activate Button */}
                            <button
                              onClick={() => handleToggleStatus(dealer)}
                              disabled={isActionLoading}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95 ${
                                dealer.is_active
                                  ? "bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 shadow-sm"
                                  : "bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 shadow-sm"
                              }`}
                              title={dealer.is_active ? "Suspend showroom access" : "Activate showroom access"}
                            >
                              <Power size={13} className={isActionLoading ? "animate-spin" : ""} />
                              <span>
                                {isActionLoading
                                  ? "Processing..."
                                  : dealer.is_active
                                  ? "Suspend"
                                  : "Activate"}
                              </span>
                            </button>

                            {/* Discreet Red Trash Button */}
                            <button
                              onClick={() => setDealerToDelete(dealer)}
                              className="p-2 bg-zinc-900 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/30 text-zinc-400 hover:text-red-400 rounded-xl transition"
                              title="አጥፋ / Delete Dealership"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Edit Subscription Plan Modal */}
      {editingDealer && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditingDealer(null)}
        >
          <div
            className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-purple-400" />
                <h3 className="text-sm font-bold text-white">
                  Manage Plan: {editingDealer.name}
                </h3>
              </div>
              <button
                onClick={() => setEditingDealer(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Plan Selector */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                  Subscription Tier
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["starter", "pro", "enterprise"] as const).map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setEditPlan(plan)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold uppercase border transition ${
                        editPlan === plan
                          ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      {plan}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Vehicles Capacity */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                  Max Allowed Vehicles (Car Cap)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1000}
                  value={editMaxVehicles}
                  onChange={(e) => setEditMaxVehicles(parseInt(e.target.value) || 10)}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-purple-500 px-3.5 py-2.5 rounded-xl text-xs text-white outline-none transition"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  Current active vehicles: {editingDealer.vehicle_count} cars
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingDealer(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={isSavingPlan}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-600/30"
              >
                {isSavingPlan ? "Saving..." : "Save Plan Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Confirmation Dialog Modal for Dealership Deletion */}
      {dealerToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => !isDeletingDealer && setDealerToDelete(null)}
        >
          <div
            className="bg-zinc-950 border border-red-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl shadow-red-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">ይህንን ሾውሩም ማጥፋት ይፈልጋሉ?</h4>
                <p className="text-xs text-red-400/90 font-medium">Permanent Dealership Cascade Deletion</p>
              </div>
            </div>

            <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-3.5 space-y-2 text-xs text-zinc-300">
              <p className="font-semibold text-white">
                እርግጠኛ ነዎት ይህ ሾውሩም እና በውስጡ ያሉ ሁሉም መኪኖች እስከመጨረሻው እንዲሰረዙ ይፈልጋሉ?
              </p>
              <p className="text-zinc-400 text-[11px]">
                (Are you sure you want to permanently erase this dealership and all its vehicles?)
              </p>
              <div className="pt-2 border-t border-red-500/20 font-mono text-[11px] text-zinc-400 space-y-1">
                <div>🏢 ሾውሩም: <strong className="text-white">{dealerToDelete.name}</strong></div>
                <div>🚗 የተያያዙ መኪኖች: <strong className="text-white">{dealerToDelete.vehicle_count ?? 0} vehicles</strong></div>
                <div className="text-red-400 text-[11px] font-sans font-semibold pt-1">
                  ⚠️ ማሳሰቢያ: ሁሉም ፎቶዎች፣ መኪኖች እና የቀጠሮ መረጃዎች ከሰርቨሩ እስከመጨረሻው ይሰረዛሉ (ይህ እርምጃ ወደ ኋላ አይመለስም)!
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingDealer}
                onClick={() => setDealerToDelete(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold transition disabled:opacity-50"
              >
                ተመለስ (Cancel)
              </button>
              <button
                type="button"
                disabled={isDeletingDealer}
                onClick={() => handleConfirmDeleteDealer(dealerToDelete.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-red-600/30 disabled:opacity-50"
              >
                {isDeletingDealer ? (
                  <>
                    <RotateCw size={13} className="animate-spin" />
                    <span>በማጥፋት ላይ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>አዎ፣ እስከመጨረሻው አጥፋ (Permanently Erase)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Feedback Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            toast.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300"
              : "bg-red-950/90 border-red-500/50 text-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
