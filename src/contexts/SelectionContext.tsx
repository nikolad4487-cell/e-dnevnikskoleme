import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface SelectionContextType {
  selectedSchoolId: string | null;
  selectedClassId: string | null;
  selectedChildId: string | null;
  isArchived: boolean;
  setSelectedSchoolId: (id: string | null) => void;
  setSelectedClassId: (id: string | null) => void;
  setSelectedChildId: (id: string | null) => void;
  setIsArchived: (val: boolean) => void;
  clearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(() => localStorage.getItem('selectedSchoolId'));
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(() => localStorage.getItem('selectedChildId'));
  const [isArchived, setIsArchived] = useState<boolean>(() => localStorage.getItem('isArchived') === 'true');

  useEffect(() => {
    if (selectedSchoolId) localStorage.setItem('selectedSchoolId', selectedSchoolId);
    else localStorage.removeItem('selectedSchoolId');
  }, [selectedSchoolId]);

  useEffect(() => {
    if (selectedChildId) localStorage.setItem('selectedChildId', selectedChildId);
    else localStorage.removeItem('selectedChildId');
  }, [selectedChildId]);

  useEffect(() => {
    localStorage.setItem('isArchived', String(isArchived));
  }, [isArchived]);

  const clearSelection = () => {
    setSelectedSchoolId(null);
    setSelectedClassId(null);
    setSelectedChildId(null);
    setIsArchived(false);
  };

  const value = React.useMemo(() => ({
    selectedSchoolId,
    selectedClassId,
    selectedChildId,
    isArchived,
    setSelectedSchoolId,
    setSelectedClassId,
    setSelectedChildId,
    setIsArchived,
    clearSelection
  }), [selectedSchoolId, selectedClassId, selectedChildId, isArchived]);

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
