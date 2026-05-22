
import React, { useState } from 'react';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Assuming shadcn cards are present

export default function CertificateManagementPage() {
  const [activeTab, setActiveTab] = useState('CLASS_CERTIFICATES');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Svjedodžbe i dokumenti</h1>
      
      <div className="flex gap-4 mb-6">
        {['Razredne svjedodžbe', 'Završne svjedodžbe', 'Završni rad', 'Ispiti'].map(tab => (
            <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-4 rounded ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
            >
                {tab}
            </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pregled dokumenata</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Main content will go here */}
          <p>Ovdje dolazi sadržaj za {activeTab}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
