import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Sprawdzamy uprawnienia (Operator LUB Audytor)
  useEffect(() => {
    const role = localStorage.getItem('user_role');
    if (role !== 'operator' && role !== 'audytor') {
      alert("Brak dostępu! Tylko dla Operatora lub Audytora.");
      navigate('/');
    }
  }, [navigate]);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('zgloszenia')
      .select(`
        *,
        lokalizacje ( miejscowosc, ulica )
      `)
      .eq('status', 'oczekujace')
      .order('data_zgloszenia', { ascending: false });

    if (error) console.error(error);
    else setReports(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // AKCJA 1: ZATWIERDŹ (Usuń adres -> Soft Delete)
  const handleAccept = async (report) => {
    if (!window.confirm(`Czy na pewno chcesz USUNĄĆ adres: ${report.lokalizacje.ulica} ${report.numer_domu}?`)) return;

    try {
      if (report.numer_domu !== 'center') {
          // Używamy UPSERT: jeśli adres nie istnieje, stwórz go jako usunięty
          const { error } = await supabase.from('adresy')
            .upsert(
              { 
                lokalizacja_id: report.lokalizacja_id, 
                numer_domu: report.numer_domu, 
                czy_usuniety: true 
              }, 
              { onConflict: 'lokalizacja_id, numer_domu' }
            );
          if (error) throw error;

      } else {
          // Dla całej ulicy
          const { error } = await supabase.from('lokalizacje')
            .update({ czy_usuniety: true })
            .eq('id', report.lokalizacja_id);
          if (error) throw error;
      }

      // Aktualizuj status zgłoszenia
      await supabase.from('zgloszenia')
        .update({ status: 'zatwierdzone' })
        .eq('id', report.id);

      // Logi
      await supabase.from('logi_systemowe').insert([{
          rola: localStorage.getItem('user_role'), // Zapisz kto to zrobił (operator czy audytor)
          akcja: 'usuniecie_adresu',
          opis_szczegolowy: `Usunięto: ${report.lokalizacje.ulica} ${report.numer_domu} (Zgłoszenie #${report.id})`
      }]);

      alert("Adres zablokowany, zgłoszenie zamknięte.");
      fetchReports();

    } catch (err) {
      console.error(err);
      alert("Błąd: " + err.message);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm("Odrzucić to zgłoszenie?")) return;
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
        <h2>Zgłoszenia Użytkowników ({reports.length})</h2>
        
        {loading ? <p>Ładowanie...</p> : (
          reports.length === 0 ? <p style={{padding: '20px', color: '#27ae60'}}>Brak nowych zgłoszeń. Dobra robota! 👍</p> : (
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Adres</th>
                  <th>Treść</th>
                  <th>Decyzja</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td style={{fontSize: '0.8em'}}>{new Date(r.data_zgloszenia).toLocaleString()}</td>
                    <td>
                        <strong>{r.lokalizacje?.miejscowosc}</strong><br/>
                        {r.lokalizacje?.ulica} {r.numer_domu}
                    </td>
                    <td style={{fontStyle: 'italic', color: '#c0392b'}}>"{r.opis}"</td>
                    <td>
                      <div style={{display: 'flex', gap: '5px', justifyContent: 'center'}}>
                        <button onClick={() => handleAccept(r)} className="btn-accept">✅ Usuń</button>
                        <button onClick={() => handleReject(r.id)} className="btn-reject">❌ Odrzuć</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

export default Reports;