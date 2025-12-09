import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

function Home() {
  const [locations, setLocations] = useState([]);
  
  // Stany wyszukiwania
  const [searchCity, setSearchCity] = useState('');   
  const [searchTerm, setSearchTerm] = useState('');   
  const [sortBy, setSortBy] = useState('miejscowosc');
  const [loading, setLoading] = useState(false);

  // --- LOGOWANIE ---
  const [userRole, setUserRole] = useState(localStorage.getItem('user_role') || 'guest');
  const navigate = useNavigate();

  // Stany do Modala Logowania
  const [showLogin, setShowLogin] = useState(false);
  const [targetRole, setTargetRole] = useState(''); // 'audytor' lub 'operator'
  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // 1. Kliknięcie w przycisk "Zaloguj"
  const initiateLogin = (role) => {
    setTargetRole(role);
    setLoginForm({ login: '', password: '' });
    setLoginError('');
    setShowLogin(true);
  };

  // 2. Zatwierdzenie formularza
  const handleLoginSubmit = (e) => {
    e.preventDefault();

    const { login, password } = loginForm;

    if (targetRole === 'audytor') {
        // --- DANE DLA AUDYTORA ---
        if (login === 'Audytor' && password === 'Inżynierka2025') {
            finalizeLogin('audytor');
        } else {
            setLoginError('Błędny login lub hasło Audytora!');
        }
    } 
    else if (targetRole === 'operator') {
        // --- DANE DLA OPERATORA ---
        if (login === 'operator' && password === 'operator') {
            finalizeLogin('operator');
        } else {
            setLoginError('Błędne dane (spróbuj: operator / operator)');
        }
    }
  };

  const finalizeLogin = (role) => {
    localStorage.setItem('user_role', role);
    setUserRole(role);
    setShowLogin(false);
    alert(`Pomyślnie zalogowano jako: ${role.toUpperCase()}`);
  };

  const handleLogout = () => {
    if (window.confirm("Czy na pewno chcesz się wylogować?")) {
        localStorage.removeItem('user_role');
        setUserRole('guest');
    }
  };

  // -----------------

  const fetchLocations = async (city, street, sortMethod) => {
    setLoading(true);
    try {
      // Pobieramy tylko te, które NIE są usunięte
      let query = supabase.from('lokalizacje')
        .select('id, wojewodztwo, miejscowosc, ulica')
        .eq('czy_usuniety', false);

      if (city.length > 0) query = query.ilike('miejscowosc', `%${city}%`);
      if (street.length > 0) query = query.ilike('ulica', `%${street}%`);

      if (sortMethod === 'wojewodztwo') {
        query = query.order('wojewodztwo', { ascending: true }).order('miejscowosc', { ascending: true });
      } else if (sortMethod === 'miejscowosc') {
        query = query.order('miejscowosc', { ascending: true }).order('ulica', { ascending: true });
      } else {
        query = query.order('ulica', { ascending: true });
      }

      query = query.limit(50);
      const { data, error } = await query;
      if (!error) setLocations(data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const handleDownloadReport = () => {
    const savedData = JSON.parse(localStorage.getItem('my_report') || '[]');
    if (savedData.length === 0) { alert("Twój raport jest pusty!"); return; }

    const headers = "Województwo;Miejscowość;Ulica;Numer;Kod Pocztowy;Wysokość;Współrzędne;Link do Mapy;Data Dodania\n";
    const rows = savedData.map(item => 
      `${item.wojewodztwo};${item.miejscowosc};${item.ulica};${item.numer};${item.kod};${item.wysokosc || 'Brak'};${item.wspolrzedne};${item.link_mapy || ''};${item.data_dodania}`
    ).join("\n");

    const csvContent = "\uFEFF" + headers + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PELNY_RAPORT_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearReport = () => {
    if (window.confirm("Czy na pewno chcesz usunąć wszystkie punkty z raportu?")) {
      localStorage.removeItem('my_report');
      alert("Raport wyczyszczony.");
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLocations(searchCity, searchTerm, sortBy);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchCity, searchTerm, sortBy]);

  return (
    <div className="App">
      
      {/* --- MODAL LOGOWANIA --- */}
      {showLogin && (
          <div className="login-modal-overlay">
              <div className="login-modal">
                  <h2>Logowanie: {targetRole.toUpperCase()}</h2>
                  <p>Wprowadź dane uwierzytelniające</p>
                  
                  <form onSubmit={handleLoginSubmit}>
                      <input 
                        type="text" 
                        placeholder="Login" 
                        value={loginForm.login}
                        onChange={(e) => setLoginForm({...loginForm, login: e.target.value})}
                        autoFocus
                      />
                      <input 
                        type="password" 
                        placeholder="Hasło" 
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                      />
                      
                      {loginError && <div className="login-error">{loginError}</div>}

                      <div className="login-buttons">
                          <button type="submit" className="btn-confirm-login">Zaloguj</button>
                          <button type="button" onClick={() => setShowLogin(false)} className="btn-cancel-login">Anuluj</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <header className="app-header">
        
        {/* --- GÓRNY PASEK NAWIGACJI --- */}
        <div className="top-nav-bar">
            {/* LEWA STRONA: Logowanie */}
            <div className="nav-left">
                {userRole === 'guest' ? (
                    <>
                        <button onClick={() => initiateLogin('audytor')} className="btn-role btn-auditor">
                           🔐 Zaloguj: Audytor
                        </button>
                        <button onClick={() => initiateLogin('operator')} className="btn-role btn-operator">
                           🛠️ Zaloguj: Operator
                        </button>
                    </>
                ) : (
                    <div className="user-info">
                        Zalogowano: <strong>{userRole.toUpperCase()}</strong>
                        <button onClick={handleLogout} className="btn-logout">Wyloguj</button>
                    </div>
                )}
            </div>

            {/* PRAWA STRONA: Przyciski po zalogowaniu */}
            <div className="nav-right">
                
                {/* Dla Operatora */}
                {userRole === 'operator' && (
                    <button onClick={() => navigate('/reports')} className="btn-reports-nav">
                        ⚠️ Zgłoszenia Użytkowników
                    </button>
                )}

                {/* Dla Audytora */}
                {userRole === 'audytor' && (
                    <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={() => navigate('/audit')} className="btn-audit-nav">
                             🔐 Panel Audytora
                        </button>
                        <button onClick={() => navigate('/reports')} className="btn-reports-nav" style={{backgroundColor: '#f39c12'}}>
                            ⚠️ Zgłoszenia
                        </button>
                    </div>
                )}
            </div>
        </div>

        <h1>Wyszukiwarka Ulic TERYT</h1>
        
        <div className="report-panel">
           <button onClick={handleDownloadReport} className="btn-main-download">
             📂 Pobierz Zapisany Raport
           </button>
           <button onClick={handleClearReport} className="btn-clear">
             🗑️ Wyczyść
           </button>
        </div>
      </header>

      <div className="search-bar-container">
        <input 
          type="text" 
          placeholder="Miejscowość..." 
          value={searchCity}
          onChange={(e) => setSearchCity(e.target.value)}
          className="live-search-input city-input"
        />
        <input 
          type="text" 
          placeholder="Nazwa ulicy..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="live-search-input street-input"
        />
        <select 
          className="sort-select" 
          value={sortBy} 
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="miejscowosc">Sort: Miasto</option>
          <option value="wojewodztwo">Sort: Województwo</option>
          <option value="ulica">Sort: Ulica</option>
        </select>
      </div>

      <div className="table-container">
        {loading ? (
          <p style={{ padding: '40px', color: '#999', fontStyle: 'italic' }}>Szukam...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Lokalizacja</th>
                <th style={{ width: '140px' }}>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {locations.length > 0 ? (
                locations.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="addr-subinfo">woj. {item.wojewodztwo}</span>
                      <span className="addr-city">Miejscowość {item.miejscowosc}</span>
                      <span className="addr-subinfo">{item.ulica}</span>
                    </td>
                    <td>
                      <Link to={`/select/${item.id}`}>
                        <button className="btn-search">Wybierz ➜</button>
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2" style={{ padding: '30px', color: '#999' }}>
                    {(searchCity || searchTerm) ? 'Brak wyników.' : 'Wpisz miasto lub ulicę.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Home;