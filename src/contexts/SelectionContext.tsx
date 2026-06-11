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
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(() => sessionStorage.getItem('selectedSchoolId') || localStorage.getItem('selectedSchoolId'));
  const [selectedYearId, setSelectedYearId] = useState<string | null>(() => localStorage.getItem('selectedYearId'));
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => sessionStorage.getItem('selectedClassId') || localStorage.getItem('selectedClassId'));
  const [selectedChildId, setSelectedChildId] = useState<string | null>(() => sessionStorage.getItem('selectedChildId') || localStorage.getItem('selectedChildId'));
  const [isArchived, setIsArchived] = useState<boolean>(() => sessionStorage.getItem('isArchived') === 'true' || localStorage.getItem('isArchived') === 'true');

  // Removed auto-sync useEffects


  const setSelectedSchoolIdCallback = React.useCallback((id: string | null) => {
    setSelectedSchoolId(id);
    if (id !== null) {
      sessionStorage.setItem('selectedSchoolId', id);
    } else {
      sessionStorage.removeItem('selectedSchoolId');
    }
  }, []);

  const setSelectedYearIdCallback = React.useCallback((id: string | null) => {
    setSelectedYearId(id);
    if (id !== null) {
      localStorage.setItem('selectedYearId', id);
    } else {
      localStorage.removeItem('selectedYearId');
    }
  }, []);

  const setSelectedClassIdCallback = React.useCallback((id: string | null) => {
    setSelectedClassId(id);
    if (id !== null) {
      sessionStorage.setItem('selectedClassId', id);
    } else {
      sessionStorage.removeItem('selectedClassId');
    }
  }, []);

  const setSelectedChildIdCallback = React.useCallback((id: string | null) => {
    setSelectedChildId(id);
    if (id !== null) {
      sessionStorage.setItem('selectedChildId', id);
    } else {
      sessionStorage.removeItem('selectedChildId');
    }
  }, []);

  const setIsArchivedCallback = React.useCallback((val: boolean) => {
    setIsArchived(val);
    sessionStorage.setItem('isArchived', String(val));
  }, []);

  const clearSelectionCallback = React.useCallback(() => {
    setSelectedSchoolId(null);
    setSelectedYearId(null);
    setSelectedClassId(null);
    setSelectedChildId(null);
    setIsArchived(false);
    sessionStorage.removeItem('selectedSchoolId');
    localStorage.removeItem('selectedYearId');
    sessionStorage.removeItem('selectedClassId');
    sessionStorage.removeItem('selectedChildId');
    sessionStorage.removeItem('isArchived');
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
