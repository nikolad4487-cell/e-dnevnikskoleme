import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface SelectionContextType {
  selectedSchoolId: string | null;
  selectedYearId: string | null;
  selectedClassId: string | null;
  selectedChildId: string | null;
  isArchived: boolean;
  setSelectedSchoolId: (id: string | null) => void;
  setSelectedYearId: (id: string | null) => void;
  setSelectedClassId: (id: string | null) => void;
  setSelectedChildId: (id: string | null) => void;
  setIsArchived: (val: boolean) => void;
  clearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const { user, userSchoolRoles, loading: authLoading } = useAuth();
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(() => localStorage.getItem('selectedSchoolId'));
  const [selectedYearId, setSelectedYearId] = useState<string | null>(() => localStorage.getItem('selectedYearId'));
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => localStorage.getItem('selectedClassId'));
  const [selectedChildId, setSelectedChildId] = useState<string | null>(() => localStorage.getItem('selectedChildId'));
  const [isArchived, setIsArchived] = useState<boolean>(() => localStorage.getItem('isArchived') === 'true');

  // Removed auto-sync useEffects


  const setSelectedSchoolIdCallback = React.useCallback((id: string | null) => setSelectedSchoolId(id), []);
  const setSelectedYearIdCallback = React.useCallback((id: string | null) => setSelectedYearId(id), []);
  const setSelectedClassIdCallback = React.useCallback((id: string | null) => setSelectedClassId(id), []);
  const setSelectedChildIdCallback = React.useCallback((id: string | null) => setSelectedChildId(id), []);
  const setIsArchivedCallback = React.useCallback((val: boolean) => setIsArchived(val), []);
  const clearSelectionCallback = React.useCallback(() => {
    setSelectedSchoolId(null);
    setSelectedYearId(null);
    setSelectedClassId(null);
    setSelectedChildId(null);
    setIsArchived(false);
  }, []);

  const value = React.useMemo(() => ({
    selectedSchoolId,
    selectedYearId,
    selectedClassId,
    selectedChildId,
    isArchived,
    setSelectedSchoolId: setSelectedSchoolIdCallback,
    setSelectedYearId: setSelectedYearIdCallback,
    setSelectedClassId: setSelectedClassIdCallback,
    setSelectedChildId: setSelectedChildIdCallback,
    setIsArchived: setIsArchivedCallback,
    clearSelection: clearSelectionCallback
  }), [
    selectedSchoolId, 
    selectedYearId, 
    selectedClassId, 
    selectedChildId, 
    isArchived, 
    setSelectedSchoolIdCallback,
    setSelectedYearIdCallback,
    setSelectedClassIdCallback,
    setSelectedChildIdCallback,
    setIsArchivedCallback,
    clearSelectionCallback
  ]);

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (context === undefined) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
}
