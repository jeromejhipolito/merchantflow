"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StoreState {
  selectedStoreId: string | null;
  setSelectedStoreId: (id: string) => void;
}

export const useStoreSelection = create<StoreState>()(
  persist(
    (set) => ({
      selectedStoreId: null,
      setSelectedStoreId: (id) => set({ selectedStoreId: id }),
    }),
    { name: "merchantflow-store" }
  )
);
