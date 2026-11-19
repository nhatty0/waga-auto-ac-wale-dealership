"use client";
import React, { useState } from "react";
import { X, Plus, Trash2, FileText, Sparkles, Check, Car, Loader2 } from "lucide-react";
import { HandoverBelonging, VehicleHandover, VehicleHandoverPayload, Vehicle, LotIntake } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

interface HandoverFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newHandover: VehicleHandover) => void;
  existingVehicles?: Vehicle[];
  existingIntakes?: LotIntake[];
}

const COMMON_CHIPS = [
  { name: "EV Charger / ቻርጀር", defaultQty: "1" },
  { name: "ትርፍ ጎማ (Spare Tire)", defaultQty: "1" },
  { name: "ክሪክ (Jack)", defaultQty: "1" },
  { name: "የሊብሬ ኮፒ (Libre Copy)", defaultQty: "1" },
  { name: "2 ቁልፍ (Keys)", defaultQty: "2" },
  { name: "የጎማ መፍቻ (Lug Wrench)", defaultQty: "1" },
  { name: "የወለል ምንጣፍ (Floor Mats)", defaultQty: "1 Set" },
  { name: "የመጀመሪያ እርዳታ ኪት (First Aid)", defaultQty: "1" },
];

export default function HandoverFormModal({
  isOpen,
  onClose,
  onSuccess,
  existingVehicles = [],
  existingIntakes = [],
}: HandoverFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields State
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerSubcity, setOwnerSubcity] = useState("");
  const [ownerWoreda, setOwnerWoreda] = useState("");
  const [ownerHouseNo, setOwnerHouseNo] = useState("");

  const [vehicleType, setVehicleType] = useState("");
  const [manufactureYear, setManufactureYear] = useState<number | "">("");
  const [plateNumber, setPlateNumber] = useState("");
  const [color, setColor] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [horsepower, setHorsepower] = useState("");

  const [agreedSellingPrice, setAgreedSellingPrice] = useState<number | "">("");
  const [commissionOrPayout, setCommissionOrPayout] = useState("");
  const [contractDate, setContractDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [linkedVehicleId, setLinkedVehicleId] = useState<number | null>(null);

  // Dynamic Belongings
  const [belongings, setBelongings] = useState<HandoverBelonging[]>([
    { item_name: "EV Charger / ቻርጀር", quantity: "1" },
    { item_name: "ትርፍ ጎማ (Spare Tire)", quantity: "1" },
    { item_name: "ክሪክ እና መፍቻ (Jack & Tools)", quantity: "1" },
  ]);

  if (!isOpen) return null;

  // Add Item Row
  const handleAddBelongingRow = () => {
    setBelongings((prev) => [...prev, { item_name: "", quantity: "1" }]);
  };

  // Remove Item Row
  const handleRemoveBelongingRow = (idx: number) => {
    setBelongings((prev) => prev.filter((_, i) => i !== idx));
  };

  // Update Item Row
  const handleUpdateBelonging = (idx: number, field: "item_name" | "quantity", val: string) => {
    setBelongings((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  // Quick-Add Chip Click
  const handleChipClick = (chip: { name: string; defaultQty: string }) => {
    const exists = belongings.some(
      (b) => b.item_name.toLowerCase().trim() === chip.name.toLowerCase().trim()
    );
    if (!exists) {
      setBelongings((prev) => [
        ...prev,
        { item_name: chip.name, quantity: chip.defaultQty },
      ]);
    }
  };

  // Pre-fill from an existing Lot Intake
  const handlePrefillFromIntake = (intakeId: string) => {
    const found = existingIntakes.find((i) => i.id.toString() === intakeId);
    if (found) {
      setVehicleType(found.vehicle_name || "");
      if (found.year_of_production) setManufactureYear(found.year_of_production);
      setPlateNumber(found.plate_number || "");
      setOwnerFullName(found.owner_name || "");
      setOwnerPhone(found.owner_phone || "");
      if (found.final_cash_price || found.primary_cash_price) {
        setAgreedSellingPrice(found.final_cash_price || found.primary_cash_price || 0);
      }
      if (found.published_vehicle_id) {
        setLinkedVehicleId(found.published_vehicle_id);
      }
    }
  };

  // Pre-fill from an existing Showroom Vehicle
  const handlePrefillFromVehicle = (vehicleId: string) => {
    const found = existingVehicles.find((v) => v.id.toString() === vehicleId);
    if (found) {
      setLinkedVehicleId(found.id);
      setVehicleType(`${found.year} ${found.make} ${found.model}`.trim());
      setManufactureYear(found.year);
      if (found.exterior_color) setColor(found.exterior_color);
      if (found.price) setAgreedSellingPrice(found.price);
    }
  };

  // Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!ownerFullName.trim()) {
      setErrorMessage("እባክዎ የአስረካቢውን /ባለንብረት/ ሙሉ ስም ያስገቡ።");
      return;
    }
    if (!ownerPhone.trim()) {
      setErrorMessage("እባክዎ የአስረካቢውን ስልክ ቁጥር ያስገቡ።");
      return;
    }
    if (!vehicleType.trim()) {
      setErrorMessage("እባክዎ የተሽከርካሪውን ዓይነት ያስገቡ።");
      return;
    }
    if (!plateNumber.trim()) {
      setErrorMessage("እባክዎ የሰሌዳ ቁጥር ያስገቡ።");
      return;
    }

    // Filter out blank belongings
    const validBelongings = belongings.filter((b) => b.item_name.trim().length > 0);

    const payload: VehicleHandoverPayload = {
      owner_full_name: ownerFullName.trim(),
      owner_phone: ownerPhone.trim(),
      owner_subcity: ownerSubcity.trim() || null,
      owner_woreda: ownerWoreda.trim() || null,
      owner_house_no: ownerHouseNo.trim() || null,
      vehicle_type: vehicleType.trim(),
      manufacture_year: manufactureYear !== "" ? Number(manufactureYear) : null,
      chassis_number: chassisNumber.trim() || null,
      engine_number: engineNumber.trim() || null,
      horsepower: horsepower.trim() || null,
      color: color.trim() || null,
      plate_number: plateNumber.trim(),
      belongings_json: JSON.stringify(validBelongings),
      agreed_selling_price: agreedSellingPrice !== "" ? Number(agreedSellingPrice) : 0.0,
      commission_or_net_payout: commissionOrPayout.trim() || null,
      vehicle_id: linkedVehicleId,
      date: contractDate ? new Date(contractDate).toISOString() : new Date().toISOString(),
    };

    try {
      setIsSubmitting(true);
      const baseApi = getApiBaseUrl();
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token") || localStorage.getItem("dealer_token")
          : null;

      const res = await fetch(`${baseApi}/api/admin/handovers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "የመረከቢያ ውል መመዝገብ አልተቻለም።");
      }

      const createdHandover: VehicleHandover = await res.json();
      onSuccess(createdHandover);
      onClose();
    } catch (err: any) {
      console.error("Failed to create handover:", err);
      setErrorMessage(err.message || "የመረከቢያ ውል መመዝገብ አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl bg-zinc-950 sm:border border-zinc-800 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white h-[100dvh] sm:h-auto sm:max-h-[95vh]">
        {/* Top Header */}
        <div className="px-4 sm:px-5 pb-3 sm:pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-5 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="hidden min-[400px]:flex shrink-0 w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
              <FileText size={20} />
            </span>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base text-white tracking-tight truncate">
                <span className="sm:hidden">አዲስ የመኪና መረከቢያ ፎርም</span>
                <span className="hidden sm:inline">አዲስ የመኪና መረከቢያ ፎርም (New Vehicle Handover Contract)</span>
              </h3>
              <p className="hidden min-[480px]:block truncate text-[11px] text-amber-400 font-semibold mt-0.5">
                የተሽከርካሪ እና ንብረቶች መረከቢያ ህጋዊ ሰነድ (AC WALE MARKET)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 shrink-0 flex items-center justify-center text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition"
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-4 sm:pt-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-500/15 border border-red-500/40 text-red-300 rounded-xl text-xs font-semibold">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Quick Pre-fill helper bar */}
          {(existingIntakes.length > 0 || existingVehicles.length > 0) && (
            <div className="bg-zinc-900/80 border border-zinc-800/80 p-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Sparkles size={14} className="text-amber-400 shrink-0" />
                <span className="font-semibold text-zinc-300">ፈጣን መሙያ (Auto-Fill from Records):</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto min-w-0">
                {existingIntakes.length > 0 && (
                  <select
                    onChange={(e) => handlePrefillFromIntake(e.target.value)}
                    className="w-full sm:w-auto min-w-0 max-w-full sm:max-w-[16rem] bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      ከዕለት ርክክብ ምረጥ (From Daily Intake)...
                    </option>
                    {existingIntakes.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.plate_number} — {i.vehicle_name} ({i.owner_name})
                      </option>
                    ))}
                  </select>
                )}
                {existingVehicles.length > 0 && (
                  <select
                    onChange={(e) => handlePrefillFromVehicle(e.target.value)}
                    className="w-full sm:w-auto min-w-0 max-w-full sm:max-w-[16rem] bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      ከሾውሩም መኪኖች ምረጥ (From Showroom)...
                    </option>
                    {existingVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.year} {v.make} {v.model} ({v.plate_status || "Car"})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* SECTION 1: የአስረካቢው /ባለንብረት/ መረጃ (Owner Information) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-zinc-800 pb-1 flex items-center gap-2">
              <span>1. የአስረካቢው /ባለንብረት/ መረጃ (Owner Information)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  የአስረካቢው ሙሉ ስም <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={ownerFullName}
                  onChange={(e) => setOwnerFullName(e.target.value)}
                  placeholder="e.g. አቶ በቀለ ደበበ ታደሰ"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  የአስረካቢው ስልክ ቁጥር <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="09... ወይም 07..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-400 block mb-1">ክ/ከተማ</label>
                <input
                  type="text"
                  value={ownerSubcity}
                  onChange={(e) => setOwnerSubcity(e.target.value)}
                  placeholder="e.g. ቦሌ"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 block mb-1">ወረዳ</label>
                <input
                  type="text"
                  value={ownerWoreda}
                  onChange={(e) => setOwnerWoreda(e.target.value)}
                  placeholder="e.g. 04"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 block mb-1">የቤት ቁጥር</label>
                <input
                  type="text"
                  value={ownerHouseNo}
                  onChange={(e) => setOwnerHouseNo(e.target.value)}
                  placeholder="e.g. አዲስ ወይም 128"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: የተሽከርካሪው ዝርዝር መረጃ (Vehicle Specifications) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-zinc-800 pb-1 flex items-center gap-2">
              <span>2. የተሽከርካሪው ዝርዝር መረጃ (Vehicle Specifications)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  የተሽከርካሪው ዓይነት (Make & Model) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  placeholder="e.g. Suzuki Dzire / Toyota Land Cruiser Prado"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  የተመረተበት ዓ.ም (Year)
                </label>
                <input
                  type="number"
                  value={manufactureYear}
                  onChange={(e) => setManufactureYear(e.target.value ? Number(e.target.value) : "")}
                  placeholder="2023"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  ሰሌዳ ቁጥር (Plate No) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  placeholder="2-B12345 AA"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-amber-400 font-mono font-bold focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">ቀለም (Color)</label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="White / Pearl / Black"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  የፈረስ ጉልበት (HP)
                </label>
                <input
                  type="text"
                  value={horsepower}
                  onChange={(e) => setHorsepower(e.target.value)}
                  placeholder="e.g. 1.2L / 120 HP"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">የውል ቀን</label>
                <input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                  የቻንሲ ቁጥር (Chassis No)
                </label>
                <input
                  type="text"
                  value={chassisNumber}
                  onChange={(e) => setChassisNumber(e.target.value)}
                  placeholder="VIN / Chassis Number"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                  የሞተር ቁጥር (Engine No)
                </label>
                <input
                  type="text"
                  value={engineNumber}
                  onChange={(e) => setEngineNumber(e.target.value)}
                  placeholder="Engine Serial Number"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: መኪናው ላይ ያለ ንብረት (Items/Belongings in Car) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-400">
                3. መኪናው ላይ ያለ ንብረት (Items / Belongings in Car)
              </h4>
              <button
                type="button"
                onClick={handleAddBelongingRow}
                className="min-h-11 shrink-0 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1"
              >
                <Plus size={13} />
                <span>+ ንብረት ጨምር (Add Row)</span>
              </button>
            </div>

            {/* Quick-add Chips */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-zinc-400 font-medium">የተለመዱ ንብረቶች (ፈጣን ምርጫ / Quick Add Chips):</p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    className="min-h-11 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-amber-500/60 text-zinc-300 hover:text-white text-[11px] font-semibold transition active:scale-95 flex items-center gap-1"
                  >
                    <span>+</span>
                    <span>{chip.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Items Rows */}
            <div className="space-y-2 mt-2">
              {belongings.map((b, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 p-2 rounded-xl"
                >
                  <span className="text-xs font-mono font-bold text-zinc-500 w-5 shrink-0 text-center">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={b.item_name}
                    onChange={(e) => handleUpdateBelonging(idx, "item_name", e.target.value)}
                    placeholder="የንብረቱ ስም (e.g. EV Charger, Jack, Libre Copy)"
                    className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={b.quantity}
                    onChange={(e) => handleUpdateBelonging(idx, "quantity", e.target.value)}
                    placeholder="ብዛት (1)"
                    className="w-16 sm:w-20 shrink-0 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-center font-bold text-white focus:border-amber-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveBelongingRow(idx)}
                    aria-label="Remove item"
                    className="h-11 w-11 shrink-0 flex items-center justify-center text-zinc-500 hover:text-red-400 transition"
                    title="Remove item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 4: የዋጋ እና የኮሚሽን ስምምነት (Price & Consignment Agreement) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-zinc-800 pb-1 flex items-center gap-2">
              <span>4. የዋጋ እና የኮሚሽን ስምምነት (Price & Consignment Payout)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  መኪናው የሚሸጥበት ዋጋ በብር (Agreed Selling Price in ETB)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={agreedSellingPrice}
                    onChange={(e) =>
                      setAgreedSellingPrice(e.target.value ? Number(e.target.value) : "")
                    }
                    placeholder="e.g. 3200000"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-emerald-400 font-mono font-bold focus:border-amber-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-zinc-500">
                    ETB
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                  ኮሚሽን / ለአስረካቢ የሚሰጥ ብር (Commission / Net Payout)
                </label>
                <input
                  type="text"
                  value={commissionOrPayout}
                  onChange={(e) => setCommissionOrPayout(e.target.value)}
                  placeholder="e.g. 50,000 ብር ኮሚሽን ወይም የተጣራ 3,150,000 ብር ለአስረካቢ"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none font-semibold"
                />
              </div>
            </div>

            {/* Legal Agreement Paragraph Preview */}
            <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl text-xs text-zinc-400 leading-relaxed italic">
              <span className="font-bold text-zinc-300 not-italic block mb-1">
                የሕጋዊ ውል ቃል ቅድመ እይታ (Legal Paragraph Preview):
              </span>
              &ldquo;እኔ ስሜ ከላይ የተጠቀሰው አስረካቢ{" "}
              <span className="text-white font-bold">{ownerFullName || "[የአስረካቢ ስም]"}</span> በዛሬው ቀን ከላይ
              በዝርዝር የተጠቀሰውን ተሽከርካሪ ከነሙሉ ይዞታውና ንብረቶቹ ለኤሲ ዋለ መኪና መሸጫ ድርጅት በብር{" "}
              <span className="text-emerald-400 font-bold">
                {agreedSellingPrice ? Number(agreedSellingPrice).toLocaleString() + " ብር" : "[የተስማሙበት ዋጋ]"}
              </span>{" "}
              እንዲሸጥልኝ ያስረከብኩ ሲሆን፣ የተሽከርካሪው ሽያጭ ሲጠናቀቅ ኮሚሽን / ለአስረካቢ የሚሰጠው የተጣራ ክፍያ{" "}
              <span className="text-white font-bold">
                {commissionOrPayout || "[የኮሚሽን / የተጣራ ክፍያ ስምምነት]"}
              </span>{" "}
              እንደሆነ ተስማምተን ይህን የመረከቢያ ውል በሙሉ ፈቃዳችን ፈርመናል።&rdquo;
            </div>
          </div>

          {/* Footer Actions (sticky Save bar) */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-zinc-950/95 backdrop-blur border-t border-zinc-800 flex items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-12 shrink-0 px-4 text-xs font-bold text-zinc-400 hover:text-white rounded-xl bg-zinc-900 border border-zinc-800 transition"
            >
              ተመለስ (Cancel)
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 flex-1 sm:flex-none min-w-0 justify-center px-4 sm:px-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>ውል በመመዝገብ ላይ...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>ውሉን መዝግብ እና አትም (Save & Generate Form)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
