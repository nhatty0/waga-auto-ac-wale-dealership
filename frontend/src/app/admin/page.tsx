"use client";

import AdminDashboard from "@/components/admin/AdminDashboard";

/** Staff desk: vehicles, appointments, rentals, drivers. Owner desks live in /superadmin. */
export default function AdminPage() {
  return <AdminDashboard portal="staff" />;
}
