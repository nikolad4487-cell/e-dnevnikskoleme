import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Jeste li sigurni?",
  message = "Jeste li sigurni da želite obrisati ovaj zapis?",
  loading = false
}: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 bg-black/40 transition-opacity" 
        onClick={loading ? undefined : onClose}
      />
      <div className="bg-white border border-gray-300 w-full max-w-md relative overflow-hidden shadow-[10px_10px_0px_rgba(0,0,0,0.1)]">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 border border-red-200 bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="text-red-500" size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tighter">{title}</h3>
              <p className="text-[11px] font-bold text-gray-500 leading-tight mt-1">{message}</p>
            </div>
          </div>
          
          <div className="flex gap-2 mt-8">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-[10px] font-black uppercase text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Odustani
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 transition-colors flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Obriši"
              )}
            </button>
          </div>
        </div>
        <button 
          onClick={onClose}
          disabled={loading}
          className="absolute top-3 right-3 text-gray-300 hover:text-gray-600 disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
