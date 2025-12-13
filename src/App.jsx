import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import SelectMode from './SelectMode';
import Details from './Details';
import Reports from './Reports';
import Audit from './Audit';
import ReportPreview from './ReportPreview'; // <--- IMPORT
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/select/:id" element={<SelectMode />} />
        <Route path="/details/:id/:point" element={<Details />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit" element={<Audit />} />
        
        {/* NOWA TRASA: */}
        <Route path="/report-preview" element={<ReportPreview />} />
      </Routes>
    </Router>
  );
}

export default App;