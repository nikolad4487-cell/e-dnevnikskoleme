import React, { useState, useEffect } from 'react';
import { Payment } from './DossierTypes';
import { DollarSign, Printer, Plus, Trash2, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface DossierFinencesTabProps {
  studentId: string;
  studentName: string;
  isStaff: boolean;
  schoolId?: string;
  classId?: string;
}

export function DossierFinencesTab({ studentId, studentName, isStaff, schoolId, classId }: DossierFinencesTabProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Form states
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [purpose, setPurpose] = useState('Ekskurzije');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'PLAĆENO' | 'DJELOMIČNO PLAĆENO' | 'NIJE PLAĆENO'>('NIJE PLAĆENO');

  const [receiptToPrint, setReceiptToPrint] = useState<Payment | null>(null);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments?studentId=${studentId}`);
      if (res.ok) {
        setPayments(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [studentId]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Unesite valjani iznos.');
      return;
    }

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          class_id: classId,
          school_id: schoolId,
          purpose,
          amount: parseFloat(amount),
          date,
          status
        })
      });

      if (res.ok) {
        toast.success('Financijsko zaduženje uspješno kreirano.');
        setShowPaymentForm(false);
        setAmount('');
        fetchPayments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (paymentId: string, newStatus: 'PLAĆENO' | 'DJELOMIČNO PLAĆENO' | 'NIJE PLAĆENO') => {
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        toast.success('Status uplate ažuriran.');
        setPayments(payments.map(p => p.id === paymentId ? { ...p, status: newStatus } : p));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!window.confirm('Sigurno želite poništiti ovo zaduženje/uplatu?')) return;
    try {
      const res = await fetch(`/api/payments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Zaduženje uklonjeno.');
        setPayments(payments.filter(p => p.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Aggregates
  const totalInvoiced = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = payments.filter(p => p.status === 'PLAĆENO').reduce((sum, p) => sum + p.amount, 0) +
                    payments.filter(p => p.status === 'DJELOMIČNO PLAĆENO').reduce((sum, p) => sum + (p.amount * 0.5), 0); // Heuristic partial
  const totalOutstanding = totalInvoiced - totalPaid;

  const handlePrintReceipt = (payment: Payment) => {
    setReceiptToPrint(payment);
  };

  const executePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 uppercase">Financije i plaćanja</h3>
          <p className="text-xs text-gray-500 font-medium font-sans">Evidencija uplate participacija, izleta, ekskurzija i kupnje maturalnih svjedodžbi</p>
        </div>
        {isStaff && (
          <button 
            type="button"
            id="add-payment-btn"
            onClick={() => setShowPaymentForm(!showPaymentForm)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#005c8d] hover:bg-[#004a70] text-white text-xs font-black uppercase tracking-wider rounded shadow transition-all cursor-pointer"
          >
            <Plus size={14} /> Novo zaduženje
          </button>
        )}
      </div>

      {/* STATISTICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border p-4 rounded shadow-sm text-center">
          <span className="block text-[9px] font-black uppercase text-gray-400">UKUPNO ZADUŽENO</span>
          <span className="text-lg font-black text-slate-700">{totalInvoiced.toFixed(2)} EUR</span>
        </div>
        <div className="bg-white border border-emerald-100 p-4 rounded shadow-sm text-center">
          <span className="block text-[9px] font-black uppercase text-emerald-600">UKUPNO UPLAĆENO</span>
          <span className="text-lg font-black text-emerald-700">{totalPaid.toFixed(2)} EUR</span>
        </div>
        <div className="bg-white border border-amber-100 p-4 rounded shadow-sm text-center">
          <span className="block text-[9px] font-black uppercase text-amber-600">PREOSTALO ZA UPLATU</span>
          <span className="text-lg font-black text-amber-700">{totalOutstanding.toFixed(2)} EUR</span>
        </div>
      </div>

      {/* ADD PAYMENT FORM */}
      {showPaymentForm && (
        <form onSubmit={handleAddPayment} className="bg-slate-50 border border-gray-300 p-5 rounded space-y-4 shadow-sm animate-in fade-in duration-200">
          <div className="text-xs font-black text-gray-700 uppercase tracking-widest border-b pb-1.5 mb-2">Novo financijsko zaduženje</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Svrha uplate</label>
              <select id="pay-purpose" className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded text-xs" value={purpose} onChange={e => setPurpose(e.target.value)}>
                <option value="Ekskurzije">Ekskurzije (razredna putovanja)</option>
                <option value="Izleti">Izleti i sportske aktivnosti</option>
                <option value="Maturalna putovanja">Maturalno putovanje (inozemstvo)</option>
                <option value="Participacije">Dopunska participacija / Osiguranje</option>
                <option value="Ostale uplate">Ostale uplate i ispiti</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Iznos (EUR)</label>
              <input id="pay-amount" type="number" step="0.01" required placeholder="npr. 120.00" className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs bg-white" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Datum valute</label>
              <input id="pay-date" type="date" className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Tekući status uplate</label>
              <select id="pay-status" className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded text-xs" value={status} onChange={e => setStatus(e.target.value as any)}>
                <option value="NIJE PLAĆENO">NIJE PLAĆENO</option>
                <option value="DJELOMIČNO PLAĆENO">DJELOMIČNO PLAĆENO</option>
                <option value="PLAĆENO">PLAĆENO</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowPaymentForm(false)} className="px-4 py-2 border border-gray-300 text-gray-500 text-[10px] font-black uppercase rounded bg-white">Odustani</button>
            <button type="submit" className="px-5 py-2 bg-[#005c8d] text-white text-[10px] font-black uppercase rounded shadow">Kreiraj financijsku stavku</button>
          </div>
        </form>
      )}

      {/* PAYMENTS HISTORY LIST */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden min-h-60">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-gray-200 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
              <th className="p-3 pl-4">Broj računa / Potvrde</th>
              <th className="p-3">Svrha stavke</th>
              <th className="p-3">Datum dospijeća</th>
              <th className="p-3 text-right">Iznos</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Radnje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-20 text-xs font-bold text-gray-400 uppercase tracking-widest">Učitavanje financijskih stavki...</td>
              </tr>
            ) : payments.length > 0 ? (
              payments.map(pay => (
                <tr key={pay.id} className="hover:bg-slate-50/50">
                  <td className="p-3 pl-4 text-xs font-mono font-medium text-slate-400">{pay.receipt_number || 'STAVKA-UNASSIGNED'}</td>
                  <td className="p-3 text-gray-900 font-bold uppercase">{pay.purpose}</td>
                  <td className="p-3 text-gray-500">{pay.date}</td>
                  <td className="p-3 text-right text-gray-900 font-extrabold">{pay.amount.toFixed(2)} EUR</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className={`inline-block px-2.5 py-0.5 text-[8px] font-black uppercase rounded-full tracking-wider ${
                        pay.status === 'PLAĆENO' 
                          ? "bg-green-100 text-green-700" 
                          : pay.status === 'DJELOMIČNO PLAĆENO'
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-600"
                      }`}>
                        {pay.status}
                      </span>
                      {isStaff && (
                        <select 
                          id={`change-status-${pay.id}`}
                          className="px-1 py-0.5 text-[8px] font-bold border border-gray-300 rounded outline-none bg-white text-gray-400"
                          value={pay.status}
                          onChange={e => handleUpdateStatus(pay.id, e.target.value as any)}
                        >
                          <option value="NIJE PLAĆENO">Promijeni</option>
                          <option value="PLAĆENO">PLAĆENO</option>
                          <option value="DJELOMIČNO PLAĆENO">DJELOMIČNO</option>
                          <option value="NIJE PLAĆENO">NIJE PLAĆENO</option>
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="p-3 justify-center">
                    <div className="flex items-center justify-center gap-3">
                      <button 
                        type="button" 
                        onClick={() => handlePrintReceipt(pay)} 
                        className="flex items-center gap-1 text-[9px] font-black text-[#005c8d] uppercase bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded"
                        title="Generiraj uplatnicu / Potvrdu o plaćanju"
                      >
                        <Printer size={12} /> Tisak/Potvrda
                      </button>
                      {isStaff && (
                        <button 
                          type="button" 
                          onClick={() => handleDeletePayment(pay.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Ukloni stavku"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-20 text-xs font-bold text-gray-400 uppercase tracking-widest italic bg-slate-50/20">Učenik trenutno nema evidentiranih financijskih dugovanja ili uplaćenih aranžmana.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CUSTOM PRINTABLE RECEIPT FRAME OVERLAY */}
      {receiptToPrint && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white max-w-lg w-full rounded-md shadow-2xl overflow-hidden border border-gray-300 animate-in zoom-in-95 duration-200">
            
            {/* Action Header */}
            <div className="bg-slate-100 px-5 py-3 border-b flex justify-between items-center no-print">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Potvrda o plaćanju / Uplatnica</span>
              <div className="flex gap-2">
                <button type="button" onClick={executePrint} className="flex items-center gap-1 px-3 py-1.5 bg-[#005c8d] text-white text-[10px] font-black uppercase rounded shadow hover:bg-[#004a70]">
                  <Printer size={12} /> Ispis
                </button>
                <button type="button" onClick={() => setReceiptToPrint(null)} className="px-3 py-1.5 border border-gray-300 text-gray-500 text-[10px] font-black uppercase rounded bg-white hover:bg-slate-50">
                  Zatvori
                </button>
              </div>
            </div>

            {/* Receipt Printable Canvas */}
            <div className="p-8 space-y-6 text-black bg-white select-text print-clean font-sans">
              
              {/* Receipt Header */}
              <div className="flex justify-between items-start border-b border-gray-300 pb-4">
                <div>
                  <h4 className="text-sm font-black uppercase leading-tight">UGOSTITELJSKO-TURISTIČKA ŠKOLA</h4>
                  <p className="text-[10px] text-gray-500 shrink font-bold uppercase tracking-tight">OIB: 89332211029 • Srednjoškolsko strukovno obrazovanje</p>
                  <p className="text-[9px] text-gray-400 uppercase leading-none mt-1">Trg Republike Hrvatske 1, 10000 Zagreb</p>
                </div>
                <div className="text-right">
                  <span className="block text-[8px] font-black text-gray-400">BROJ TRANSAKCIJE:</span>
                  <span className="font-mono text-xs font-extrabold">{receiptToPrint.receipt_number || 'POT-000000'}</span>
                </div>
              </div>

              {/* Transaction Statement */}
              <div className="space-y-4">
                <h3 className="text-sm font-black tracking-widest text-center border-y border-dashed py-1 uppercase">SLUŽBENA POTVRDA PRIMITKA SREDSTAVA</h3>
                
                <div className="grid grid-cols-2 gap-4 text-[11px] leading-snug">
                  <div>
                    <span className="block text-[8px] font-black text-gray-400 uppercase">Uplatitelj (Učenik/Roditelj):</span>
                    <span className="font-extrabold text-[#005c8d] uppercase text-xs">{studentName}</span>
                    <p className="text-[9px] text-gray-500 uppercase mt-0.5">Identifikator: {studentId.slice(0, 8)}</p>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-gray-400 uppercase">Svrha uplate:</span>
                    <span className="font-bold uppercase text-xs">{receiptToPrint.purpose}</span>
                    <p className="text-[9px] text-gray-400 uppercase mt-0.5">Metoda: Bezgotovinska transakcija / Žiroračun</p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-gray-200/50 p-4 rounded text-center">
                  <span className="block text-[9px] font-black text-slate-400 uppercase">UPLAĆENI FINANCIJSKI IZNOS:</span>
                  <span className="text-2xl font-black text-[#005c8d]">{receiptToPrint.amount.toFixed(2)} EUR</span>
                  <p className="text-[9px] font-black block text-slate-500 uppercase mt-1 tracking-widest">
                    Status transakcije: {receiptToPrint.status}
                  </p>
                </div>
              </div>

              {/* Fine Print / Signatures */}
              <div className="grid grid-cols-2 gap-6 pt-10 text-[10px] uppercase font-bold text-center">
                <div className="space-y-12">
                  <div className="border-b border-gray-400 w-3/4 mx-auto pb-1" />
                  <span className="text-[8px] text-gray-400 font-extrabold">Potpis učenika / roditelja</span>
                </div>
                <div className="space-y-12">
                  <div className="border-b border-gray-400 w-3/4 mx-auto pb-1 flex justify-center items-center font-serif italic text-blue-800 text-[11px]">Sustav UTS</div>
                  <span className="text-[8px] text-gray-400 font-extrabold">Potpis i pečat UTS blagajne</span>
                </div>
              </div>

              <div className="text-center pt-8 border-t border-dashed text-[8px] font-normal text-gray-400 uppercase tracking-widest">
                UTS Službeni dokument izdan elektroničkim putem u sustavu UTS e-Dnevnik ravnatelja. Zagreb, datum izdavanja {receiptToPrint.date}.
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
