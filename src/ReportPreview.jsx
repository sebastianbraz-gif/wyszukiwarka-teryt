import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

function ReportPreview() {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const savedData = JSON.parse(localStorage.getItem('my_report') || '[]');
    setItems(savedData);
    setSelectedIds(savedData.map((_, index) => index)); 
  }, []);

  const handleCheckboxChange = (index) => {
    if (selectedIds.includes(index)) {
      setSelectedIds(selectedIds.filter(id => id !== index));
    } else {
      setSelectedIds([...selectedIds, index]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((_, index) => index));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm("Usunąć zaznaczone pozycje z raportu?")) return;

    const newItems = items.filter((_, index) => !selectedIds.includes(index));
    setItems(newItems);
    setSelectedIds([]);
    localStorage.setItem('my_report', JSON.stringify(newItems));
  };

  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) {
      alert("Nie zaznaczono żadnych elementów!");
      return;
    }

    const dataToDownload = items.filter((_, index) => selectedIds.includes(index));

    // ZMIANA: Dodano "Cechy" do nagłówka
    const headers = "Województwo;Miejscowość;Ulica;Numer;Kod;Wysokość;Współrzędne;Link;Data;Cechy\n";
    
    // ZMIANA: Dodano item.cechy do wiersza
    const rows = dataToDownload.map(item => 
      `${item.wojewodztwo || ''};${item.miejscowosc || ''};${item.ulica || ''};${item.numer || ''};${item.kod || ''};${item.wysokosc || ''};${item.coords || ''};${item.link || ''};${item.data || ''};${item.cechy || ''}`
    ).join("\n");

    const blob = new Blob(["\uFEFF" + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `RAPORT_WYBRANE_${new Date().toLocaleDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="App">
      <header className="app-header" style={{backgroundColor: '#2980b9'}}>
        <h1>Kreator Raportu 📂</h1>
        <Link to="/" style={{color: 'white', textDecoration: 'underline'}}>Wróć do wyszukiwarki</Link>
      </header>

      <div className="table-container" style={{maxWidth: '1000px'}}>
        <div className="report-controls">
            <h2 style={{margin: 0}}>Wybierz rekordy do pobrania</h2>
            <div className="selection-info">
                Zaznaczono: <strong>{selectedIds.length}</strong> / {items.length}
            </div>
        </div>

        {items.length === 0 ? (
            <div className="empty-state">
                <p>Twój raport jest pusty.</p>
                <button onClick={() => navigate('/')} className="btn-search">Dodaj adresy</button>
            </div>
        ) : (
            <>
                <div className="bulk-actions">
                    <button onClick={toggleSelectAll} className="btn-secondary">
                        {selectedIds.length === items.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                    </button>
                    <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={handleDeleteSelected} className="btn-delete-selection" disabled={selectedIds.length === 0}>
                            🗑️ Usuń zaznaczone
                        </button>
                        <button onClick={handleDownloadSelected} className="btn-download-final" disabled={selectedIds.length === 0}>
                            📥 POBIERZ PLIK CSV
                        </button>
                    </div>
                </div>

                <table className="preview-table">
                    <thead>
                        <tr>
                            <th style={{width: '40px'}}>✓</th>
                            <th>Lokalizacja</th>
                            <th>Ulica i Numer</th>
                            <th>Współrzędne</th>
                            <th>Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index} className={selectedIds.includes(index) ? 'row-selected' : ''}>
                                <td className="checkbox-cell">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.includes(index)} 
                                        onChange={() => handleCheckboxChange(index)} 
                                    />
                                </td>
                                <td>
                                    <span style={{fontSize:'0.8em', color:'#666'}}>{item.wojewodztwo}</span><br/>
                                    <strong>{item.miejscowosc}</strong>
                                </td>
                                <td>
                                    {item.ulica} {item.numer}<br/>
                                    <span style={{fontSize:'0.8em', color:'#2980b9'}}>{item.kod || 'Brak kodu'}</span>
                                </td>
                                <td style={{fontSize: '0.85em', fontFamily: 'monospace'}}>
                                    {item.coords || '-'}
                                </td>
                                <td style={{fontSize: '0.85em', color: '#777'}}>{item.data}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </>
        )}
      </div>
    </div>
  );
}

export default ReportPreview;