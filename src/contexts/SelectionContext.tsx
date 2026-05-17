import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  const { user, userSchoolRoles, loading: authLoading } = useAuth();
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(() => localStorage.getItem('selectedSchoolId'));
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => localStorage.getItem('selectedClassId'));
  const [selectedChildId, setSelectedChildId] = useState<string | null>(() => localStorage.getItem('selectedChildId'));
  const [isArchived, setIsArchived] = useState<boolean>(() => localStorage.getItem('isArchived') === 'true');

  // Async validation of selections
  useEffect(() => {
    if (authLoading || !user) return;

    const validateSelections = async () => {
      console.log('[SELECTION] Validating stored selections...');
      
      // 1. School Validation
      if (selectedSchoolId) {
        const { data: school, error } = await supabase
          .from('schools')
          .select('id')
          .eq('id', selectedSchoolId)
          .maybeSingle();
        
        if (error || !school) {
          console.warn('[SELECTION] Invalid school ID found, clearing:', selectedSchoolId);
          setSelectedSchoolId(null);
          setSelectedClassId(null);
        }
      }

      // 2. Class Validation
      if (selectedClassId) {
        const { data: cls, error } = await supabase
          .from('classes')
          .select('id')
          .eq('id', selectedClassId)
          .maybeSingle();
        
        if (error || !cls) {
          console.warn('[SELECTION] Invalid class ID found, clearing:', selectedClassId);
          setSelectedClassId(null);
        }
      }

      // 3. Child Validation
      if (selectedChildId) {
        const { data: child, error } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', selectedChildId)
          .maybeSingle();
        
        if (error || !child) {
          console.warn('[SELECTION] Invalid child ID found, clearing:', selectedChildId);
          setSelectedChildId(null);
        }
      }
    };

    validateSelections();
  }, [user, authLoading]);

  useEffect(() => {
    if (selectedSchoolId) localStorage.setItem('selectedSchoolId', selectedSchoolId);
    else localStorage.removeItem('selectedSchoolId');
  }, [selectedSchoolId]);

  useEffect(() => {
    if (selectedClassId) localStorage.setItem('selectedClassId', selectedClassId);
    else localStorage.removeItem('selectedClassId');
  }, [selectedClassId]);

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
