"use client";
import React, { createContext, useContext, useState } from "react";
import { Vehicle } from "@/types";

interface CompareContextType {
  selectedVehicles: Vehicle[];
  addToCompare: (vehicle: Vehicle) => void;
  removeFromCompare: (vehicleId: number) => void;
  toggleCompare: (vehicle: Vehicle) => void;
  clearCompare: () => void;
  isInCompare: (vehicleId: number) => boolean;
  isCompareModalOpen: boolean;
  setIsCompareModalOpen: (open: boolean) => void;
}

const CompareContext = createContext<CompareContextType | undefined>(undefined);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [selectedVehicles, setSelectedVehicles] = useState<Vehicle[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  const isInCompare = (vehicleId: number) => {
    return selectedVehicles.some((v) => v.id === vehicleId);
  };

  const addToCompare = (vehicle: Vehicle) => {
    if (isInCompare(vehicle.id)) return;
    if (selectedVehicles.length >= 2) {
      // Keep at most 2: replace the 2nd one
      setSelectedVehicles([selectedVehicles[0], vehicle]);
    } else {
      setSelectedVehicles((prev) => [...prev, vehicle]);
    }
  };

  const removeFromCompare = (vehicleId: number) => {
    setSelectedVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
  };

  const toggleCompare = (vehicle: Vehicle) => {
    if (isInCompare(vehicle.id)) {
      removeFromCompare(vehicle.id);
    } else {
      addToCompare(vehicle);
    }
  };

  const clearCompare = () => {
    setSelectedVehicles([]);
    setIsCompareModalOpen(false);
  };

  return (
    <CompareContext.Provider
      value={{
        selectedVehicles,
        addToCompare,
        removeFromCompare,
        toggleCompare,
        clearCompare,
        isInCompare,
        isCompareModalOpen,
        setIsCompareModalOpen,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error("useCompare must be used within a CompareProvider");
  }
  return context;
}
