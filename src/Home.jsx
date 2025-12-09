import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Link } from 'react-router-dom';
import './App.css';

function Home() {
  const [locations, setLocations] = useState([]);
  
  // Stany dla wyszukiwania
  const [searchCity, setSearchCity] = useState('');   
  const [searchTerm, setSearchTerm] = useState('');   
  
  const [sortBy, setSortBy] = useState('miejscowosc');
  const [loading, setLoading] = useState(false);

  // Funkcja pobierająca dane z bazy (Wyszukiwarka)
  const fetchLocations = async (city, street, sortMethod) => {
    setLoading(true);
    try {
      let query = supabase.from('lokalizacje').select('id, wojewodztwo, miejscowosc, ulica');

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
      
      if (error) console.error("Błąd pobierania:", error);
      else setLocations(data || []);
      
    } catch (err) {
      console.error("Błąd krytyczny:", err);
    } finally {
      setLoading(false);
    }
  };

  // NOWE: Funkcja pobierania ZBIORCZEGO raportu z LocalStorage (z linkiem do mapy)
  const handleDownloadReport = () => {
    // 1. Pobierz dane z pamięci przeglądarki
    const savedData = JSON.parse(localStorage.getItem('my_report') || '[]');

    if (savedData.length === 0) {
      alert("Twój raport jest pusty! Dodaj najpierw jakieś punkty.");
      return;
    }

    // 2. Generuj CSV z nagłówkami
    const headers = "Województwo;Miejscowość;Ulica;Numer;Kod Pocztowy;Wysokość;Współrzędne;Link do Mapy;Data Dodania\n";
    
    // Mapujemy dane do wierszy CSV
    const rows = savedData.map(item => 
      `${item.wojewodztwo};${item.miejscowosc};${item.ulica};${item.numer};${item.kod};${item.wysokosc || 'Brak'};${item.wspolrzedne};${item.link_mapy || ''};${item.data_dodania}`
    ).join("\n");

    const csvContent = "\uFEFF" + headers + rows;

    // 3. Pobierz plik
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PELNY_RAPORT_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Funkcja czyszczenia raportu
  const handleClearReport = () => {
    if (window.confirm("Czy na pewno chcesz usunąć wszystkie zapisane punkty z raportu?")) {
      localStorage.removeItem('my_report');
      alert("Raport wyczyszczony.");
    }
  };

  // Live Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLocations(searchCity, searchTerm, sortBy);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchCity, searchTerm, sortBy]);

  return (
    <div className="App">
      <header className="app-header">
        <h1>Wyszukiwarka Ulic TERYT</h1>
        
        {/* Panel Raportu w nagłówku */}
        <div className="report-panel">
           <button onClick={handleDownloadReport} className="btn-main-download">
             📂 Pobierz Zapisany Raport
           </button>
           <button onClick={handleClearReport} className="btn-clear">
             🗑️ Wyczyść
           </button>
        </div>
      </header>

      {/* Pasek Wyszukiwania */}
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