import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

function Audit() {
  const [deletedItems, setDeletedItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem('user_role');
    if (role !== 'audytor') {
      alert("Brak dostępu! Panel tylko dla Audytora.");
      navigate('/');
    }
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);

    const { data: trash } = await supabase
      .from('adresy')
      .select(`*, lokalizacje ( miejscowosc, ulica )`)
      .eq('czy_usuniety', true);

    const { data: systemLogs } = await supabase
      .from('logi_systemowe')
      .select('*')
      .order('data_akcji', { ascending: false })
      .limit(50);

    setDeletedItems(trash || []);
    setLogs(systemLogs || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleRestore = async (item) => {
    if (!window.confirm(`Przywrócić adres: ${item.lokalizacje.ulica} ${item.numer_domu}?`)) return;
    try {
      await supabase.from('adresy').update({ czy_usuniety: false }).eq('id', item.id);
      await supabase.from('logi_systemowe').insert([{ rola: 'audytor', akcja: 'przywrocenie_adresu', opis_szczegolowy: `Przywrócono: ${item.lokalizacje.ulica} ${item.numer_domu}` }]);
      alert("Adres przywrócony.");
      fetchData();
    } catch (err) { alert("Błąd: " + err.message); }
  };

  // NOWE: Cofanie edycji (zmiany kodu)
  const handleUndoChange = async (log) => {
      if (!log.tabela || !log.rekord_id || !log.poprzednie_dane) {
          alert("Brak danych historycznych do cofnięcia.");
          return;
      }
      
      // Wyciągamy starą wartość z JSONa (np. { kod_pocztowy: "..." })
      // Zakładamy, że chcemy przywrócić wszystkie pola zapisane w 'poprzednie_dane'
      if (!window.confirm(`Czy na pewno cofnąć zmianę?\nPrzywrócone zostaną dane: ${JSON.stringify(log.poprzednie_dane)}`)) return;

      try {
          const { error } = await supabase
            .from(log.tabela) // Dynamicznie wybieramy tabelę (adresy/lokalizacje)
            .update(log.poprzednie_dane) // Wrzucamy stare dane
            .eq('id', log.rekord_id);

          if (error) throw error;

          // Logujemy cofnięcie
          await supabase.from('logi_systemowe').insert([{ 
              rola: 'audytor', 
              akcja: 'cofniecie_zmiany', 
              opis_szczegolowy: `Cofnięto zmianę z logu ID ${log.id}` 
          }]);

          alert("Zmiana została cofnięta!");
          fetchData();

      } catch (err) {
          alert("Błąd cofania: " + err.message);
      }
  };

  return (
    <div className="App">
      <header className="app-header" style={{backgroundColor: '#8e44ad'}}>
        <h1>Panel Audytora 🔐</h1>
        <div style={{marginTop: '10px'}}>
            <Link to="/" style={{color: 'white', marginRight: '20px'}}>Strona Główna</Link>
            <Link to="/reports" style={{color: '#f1c40f', fontWeight: 'bold'}}>Przejdź do Zgłoszeń ➜</Link>
        </div>
      </header>

      <div className="table-container" style={{maxWidth: '1200px'}}>
        
        {/* KOSZ */}
        <div className="audit-section">
            <h2 style={{color: '#c0392b'}}>🗑️ Kosz (Usunięte Adresy)</h2>
            {deletedItems.length === 0 ? <p>Kosz jest pusty.</p> : (
                <table className="audit-table">
                    <thead><tr><th>Adres</th><th>Akcja</th></tr></thead>
                    <tbody>
                        {deletedItems.map(item => (
                            <tr key={item.id}>
                                <td><strong>{item.lokalizacje?.miejscowosc}</strong>, {item.lokalizacje?.ulica} {item.numer_domu}</td>
                                <td><button onClick={() => handleRestore(item)} className="btn-restore">↩️ Przywróć</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>

        <hr style={{margin: '40px 0', border: '0', borderTop: '1px solid #eee'}}/>

        {/* LOGI I COFANIE ZMIAN */}
        <div className="audit-section">
            <h2 style={{color: '#2c3e50'}}>📜 Dziennik Zdarzeń</h2>
            <table className="logs-table">
                <thead><tr><th>Data</th><th>Rola</th><th>Akcja</th><th>Szczegóły</th><th>Opcje</th></tr></thead>
                <tbody>
                    {logs.map(log => (
                        <tr key={log.id}>
                            <td>{new Date(log.data_akcji).toLocaleString()}</td>
                            <td><span className={log.rola === 'audytor' ? 'tag-auditor' : 'tag-operator'}>{log.rola.toUpperCase()}</span></td>
                            <td>{log.akcja}</td>
                            <td style={{textAlign: 'left', fontSize: '0.9em'}}>{log.opis_szczegolowy}</td>
                            <td>
                                {/* Jeśli akcja to 'zmiana_kodu', pokaż przycisk cofania */}
                                {log.akcja === 'zmiana_kodu' && (
                                    <button onClick={() => handleUndoChange(log)} className="btn-undo-change">
                                        ↩️ Cofnij Zmianę
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}

export default Audit;