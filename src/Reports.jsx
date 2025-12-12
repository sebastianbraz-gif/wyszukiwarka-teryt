import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('errors'); // 'errors' | 'notes'
  const navigate = useNavigate();

  useEffect(() => {
    const role = getCookie('user_role');
    if (role !== 'operator' && role !== 'audytor') {
      alert("Brak dostępu! Tylko dla Operatora lub Audytora.");
      navigate('/');
    }
  }, [navigate]);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('zgloszenia')
      .select(`*, lokalizacje ( miejscowosc, ulica )`)
      .eq('status', 'oczekujace')
      .order('data_zgloszenia', { ascending: false });

    if (error) console.error(error);
    else setReports(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  // --- FILTROWANIE DANYCH NA ZAKŁADKI ---
  const errorReports = reports.filter(r => !r.opis.startsWith('[NOTATKA]'));
  const noteReports = reports.filter(r => r.opis.startsWith('[NOTATKA]'));

  // --- OBSŁUGA AKCJI ---

  const handleDeleteAddress = async (report) => {
    if (!window.confirm(`USUNĄĆ adres: ${report.lokalizacje.ulica} ${report.numer_domu}?`)) return;
    try {
      if (report.numer_domu !== 'center') {
          await supabase.from('adresy').upsert({ lokalizacja_id: report.lokalizacja_id, numer_domu: report.numer_domu, czy_usuniety: true }, { onConflict: 'lokalizacja_id, numer_domu' });
      } else {
          await supabase.from('lokalizacje').update({ czy_usuniety: true }).eq('id', report.lokalizacja_id);
      }
      await supabase.from('zgloszenia').update({ status: 'zatwierdzone' }).eq('id', report.id);
      
      await supabase.from('logi_systemowe').insert([{
          rola: getCookie('user_role'), akcja: 'usuniecie_adresu',
          opis_szczegolowy: `Usunięto: ${report.lokalizacje.ulica} ${report.numer_domu}`
      }]);
      alert("Adres zablokowany."); fetchReports();
    } catch (err) { alert("Błąd: " + err.message); }
  };

  const handleUpdateCode = async (report) => {
      const suggestion = report.opis.includes('zmianę na:') ? report.opis.split('zmianę na: ')[1] : '';
      const newCode = prompt(`Wprowadź kod:`, suggestion);
      if (!newCode) return;
      try {
          if (report.numer_domu !== 'center') {
              await supabase.from('adresy').upsert({ lokalizacja_id: report.lokalizacja_id, numer_domu: report.numer_domu, kod_pocztowy: newCode, czy_usuniety: false }, { onConflict: 'lokalizacja_id, numer_domu' });
          } else {
              await supabase.from('lokalizacje').update({ kod_pocztowy: newCode }).eq('id', report.lokalizacja_id);
          }
          await supabase.from('zgloszenia').update({ status: 'zatwierdzone' }).eq('id', report.id);
          await supabase.from('logi_systemowe').insert([{
              rola: getCookie('user_role'), akcja: 'zmiana_kodu', 
              opis_szczegolowy: `Zmieniono kod na "${newCode}" (Zgłoszenie #${report.id})`
          }]);
          alert("Kod zaktualizowany."); fetchReports();
      } catch (err) { alert("Błąd: " + err.message); }
  };

  const handleApproveNote = async (report) => {
      if (!window.confirm("Opublikować tę notatkę?")) return;
      const noteContent = report.opis.replace('[NOTATKA] ', '');
      try {
          const { error } = await supabase.from('notatki').insert([{
              lokalizacja_id: report.lokalizacja_id,
              numer_domu: report.numer_domu,
              tresc: noteContent,
              autor: 'Użytkownik'
          }]);
          if (error) throw error;
          await supabase.from('zgloszenia').update({ status: 'zatwierdzone' }).eq('id', report.id);
          await supabase.from('logi_systemowe').insert([{
              rola: getCookie('user_role'), akcja: 'dodanie_notatki', 
              opis_szczegolowy: `Zatwierdzono notatkę: "${noteContent}"`
          }]);
          alert("Notatka opublikowana!"); fetchReports();
      } catch (err) { alert("Błąd: " + err.message); }
  };

  const handleReject = async (id) => {
    if (!window.confirm("Odrzucić?")) return;
    await supabase.from('zgloszenia').update({ status: 'odrzucone' }).eq('id', id);
    fetchReports();
  };

  return (
    <div className="App">
      <header className="app-header" style={{backgroundColor: '#d35400'}}>
        <h1>Panel Operatora 🛠️</h1>
        <Link to="/" style={{color: 'white', textDecoration: 'underline'}}>Wróć do strony głównej</Link>
      </header>

      <div className="table-container" style={{maxWidth: '1000px'}}>
        
        {/* --- ZAKŁADKI (TABS) --- */}
        <div className="tabs-container">
            <button 
                className={`tab-btn ${activeTab === 'errors' ? 'active-error' : ''}`} 
                onClick={() => setActiveTab('errors')}
            >
                ⚠️ Zgłoszenia Błędów ({errorReports.length})
            </button>
            <button 
                className={`tab-btn ${activeTab === 'notes' ? 'active-note' : ''}`} 
                onClick={() => setActiveTab('notes')}
            >
                📝 Propozycje Notatek ({noteReports.length})
            </button>
        </div>

        {loading ? <p>Ładowanie...</p> : (
            <>
                {/* --- WIDOK BŁĘDÓW --- */}
                {activeTab === 'errors' && (
                    <div className="tab-content">
                        {errorReports.length === 0 ? <p className="empty-msg">Brak zgłoszeń błędów. Czysto!</p> : (
                            <table className="reports-table">
                                <thead><tr><th>Data</th><th>Adres</th><th>Opis Problemu</th><th>Akcja</th></tr></thead>
                                <tbody>
                                    {errorReports.map(r => {
                                        const isCodeError = r.opis && r.opis.includes('[BŁĄD KODU]');
                                        return (
                                            <tr key={r.id}>
                                                <td style={{fontSize: '0.8em'}}>{new Date(r.data_zgloszenia).toLocaleString()}</td>
                                                <td><strong>{r.lokalizacje?.miejscowosc}</strong><br/>{r.lokalizacje?.ulica} {r.numer_domu}</td>
                                                <td style={{color: '#c0392b'}}>"{r.opis}"</td>
                                                <td>
                                                    <div className="action-row">
                                                        {isCodeError ? (
                                                            <button onClick={() => handleUpdateCode(r)} className="btn-change">✏️ Kod</button>
                                                        ) : (
                                                            <button onClick={() => handleDeleteAddress(r)} className="btn-accept">🗑️ Usuń</button>
                                                        )}
                                                        <button onClick={() => handleReject(r.id)} className="btn-reject">❌ Odrzuć</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* --- WIDOK NOTATEK --- */}
                {activeTab === 'notes' && (
                    <div className="tab-content">
                         {noteReports.length === 0 ? <p className="empty-msg">Brak nowych notatek do zatwierdzenia.</p> : (
                            <table className="reports-table">
                                <thead><tr><th>Data</th><th>Adres</th><th>Treść Notatki</th><th>Decyzja</th></tr></thead>
                                <tbody>
                                    {noteReports.map(r => (
                                        <tr key={r.id} style={{backgroundColor: '#fffcf5'}}>
                                            <td style={{fontSize: '0.8em'}}>{new Date(r.data_zgloszenia).toLocaleString()}</td>
                                            <td><strong>{r.lokalizacje?.miejscowosc}</strong><br/>{r.lokalizacje?.ulica} {r.numer_domu}</td>
                                            <td style={{fontStyle: 'italic', color: '#d35400'}}>
                                                "{r.opis.replace('[NOTATKA] ', '')}"
                                            </td>
                                            <td>
                                                <div className="action-row">
                                                    <button onClick={() => handleApproveNote(r)} className="btn-accept" style={{backgroundColor: '#f39c12'}}>✅ Publikuj</button>
                                                    <button onClick={() => handleReject(r.id)} className="btn-reject">❌ Odrzuć</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                         )}
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
}
export default Reports;