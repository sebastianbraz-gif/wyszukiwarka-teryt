import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

function Audit() {
  const [deletedItems, setDeletedItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Zabezpieczenie: Tylko Audytor
  useEffect(() => {
    const role = localStorage.getItem('user_role');
    if (role !== 'audytor') {
      alert("Brak dostępu! Panel tylko dla Audytora.");
      navigate('/');
    }
  }, [navigate]);

  // Pobieranie danych
  const fetchData = async () => {
    setLoading(true);

    // 1. Pobierz usunięte adresy (KOSZ)
    const { data: trash, error: trashError } = await supabase
      .from('adresy')
      .select(`
        *,
        lokalizacje ( miejscowosc, ulica )
      `)
      .eq('czy_usuniety', true); // Tylko usunięte

    // 2. Pobierz logi systemowe
    const { data: systemLogs, error: logError } = await supabase
      .from('logi_systemowe')
      .select('*')
      .order('data_akcji', { ascending: false })
      .limit(50);

    if (trashError) console.error(trashError);
    if (logError) console.error(logError);

    setDeletedItems(trash || []);
    setLogs(systemLogs || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- FUNKCJA PRZYWRACANIA (COFNIJ USUNIĘCIE) ---
  const handleRestore = async (item) => {
    if (!window.confirm(`Czy na pewno chcesz PRZYWRÓCIĆ adres: ${item.lokalizacje.ulica} ${item.numer_domu}?`)) return;

    try {
      // 1. Odznacz flagę usunięcia (Przywróć)
      const { error } = await supabase
        .from('adresy')
        .update({ czy_usuniety: false })
        .eq('id', item.id);

      if (error) throw error;

      // 2. Logowanie akcji Audytora
      await supabase.from('logi_systemowe').insert([{
        rola: 'audytor',
        akcja: 'przywrocenie_adresu',
        opis_szczegolowy: `Przywrócono adres: ${item.lokalizacje.ulica} ${item.numer_domu}`
      }]);

      alert("Adres został przywrócony i jest widoczny dla użytkowników.");
      fetchData(); // Odśwież widok

    } catch (err) {
      alert("Błąd: " + err.message);
    }
  };

  return (
    <div className="App">
      <header className="app-header" style={{backgroundColor: '#8e44ad'}}>
        <h1>Panel Audytora 🔐</h1>
        <div style={{marginTop: '10px'}}>
            <Link to="/" style={{color: 'white', marginRight: '20px'}}>Strona Główna</Link>
            {/* Audytor ma też dostęp do panelu zgłoszeń */}
            <Link to="/reports" style={{color: '#f1c40f', fontWeight: 'bold'}}>Przejdź do Zgłoszeń Operatora ➜</Link>
        </div>
      </header>

      <div className="table-container" style={{maxWidth: '1200px'}}>
        
        {/* SEKCJA 1: PRZYWRACANIE DANYCH */}
        <div className="audit-section">
            <h2 style={{color: '#c0392b'}}>🗑️ Kosz (Usunięte Adresy)</h2>
            <p style={{fontSize: '0.9em', color: '#7f8c8d'}}>Tutaj możesz cofnąć decyzje operatorów o usunięciu adresów.</p>
            
            {deletedItems.length === 0 ? <p>Kosz jest pusty.</p> : (
                <table className="audit-table">
                    <thead>
                        <tr>
                            <th>Adres</th>
                            <th>Akcja</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deletedItems.map(item => (
                            <tr key={item.id}>
                                <td>
                                    <strong>{item.lokalizacje?.miejscowosc}</strong>, {item.lokalizacje?.ulica} {item.numer_domu}
                                </td>
                                <td>
                                    <button onClick={() => handleRestore(item)} className="btn-restore">
                                        ↩️ Przywróć
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>

        <hr style={{margin: '40px 0', border: '0', borderTop: '1px solid #eee'}}/>

        {/* SEKCJA 2: LOGI SYSTEMOWE */}
        <div className="audit-section">
            <h2 style={{color: '#2c3e50'}}>📜 Dziennik Zdarzeń (Logi)</h2>
            <table className="logs-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Rola</th>
                        <th>Akcja</th>
                        <th>Szczegóły</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map(log => (
                        <tr key={log.id}>
                            <td>{new Date(log.data_akcji).toLocaleString()}</td>
                            <td>
                                <span className={log.rola === 'audytor' ? 'tag-auditor' : 'tag-operator'}>
                                    {log.rola.toUpperCase()}
                                </span>
                            </td>
                            <td>{log.akcja}</td>
                            <td style={{textAlign: 'left', fontSize: '0.9em'}}>{log.opis_szczegolowy}</td>
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