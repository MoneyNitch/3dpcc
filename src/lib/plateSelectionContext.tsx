"use client";

import { createContext, useContext, useState } from "react";
import type { ParsedPlate } from "./types";

interface PlateSelection {
  plates: ParsedPlate[];
  plate: ParsedPlate;
  allSelected: boolean;
  selectPlate: (plateIndex: number) => void;
  selectAllPlates: () => void;
}

const PlateSelectionContext = createContext<PlateSelection | null>(null);

export function PlateSelectionProvider({
  plates,
  children,
}: {
  plates: ParsedPlate[];
  children: React.ReactNode;
}) {
  const [selectedIndex, setSelectedIndex] = useState(plates[0]?.plateIndex ?? 1);
  const [allSelected, setAllSelected] = useState(false);
  const plate = plates.find((item) => item.plateIndex === selectedIndex) ?? plates[0];
  if (!plate) throw new Error("A print must contain at least one plate.");

  return (
    <PlateSelectionContext.Provider
      value={{
        plates,
        plate,
        allSelected,
        selectPlate: (plateIndex) => {
          setSelectedIndex(plateIndex);
          setAllSelected(false);
        },
        selectAllPlates: () => setAllSelected(true),
      }}
    >
      {children}
    </PlateSelectionContext.Provider>
  );
}

export function usePlateSelection(): PlateSelection {
  const selection = useContext(PlateSelectionContext);
  if (!selection) throw new Error("usePlateSelection must be used within a PlateSelectionProvider");
  return selection;
}
