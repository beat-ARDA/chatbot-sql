import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [question, setQuestion] = useState("");
  const [sql, setSql] = useState("");
  const [result, setResult] = useState([]); // ⬅️ Resultado de la base de datos
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSql("");
    setResult([]); // Limpiar resultados previos

    try {
      const res = await axios.post("http://localhost:3001/sql", { question });

      setSql(res.data.sql || "No se generó SQL.");
      setResult(res.data.result || []);
    } catch (err) {
      console.error(err);
      setSql("Error generando la consulta.");
      setResult([]);
    }

    setLoading(false);
  };

  return (
    <div className="App">
      <h1>🧠 SQL desde lenguaje natural</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ej: Dame los envíos de enero"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Generando..." : "Generar SQL"}
        </button>
      </form>

      {sql && (
        <div className="resultado">
          <h3>Consulta generada:</h3>
          <pre>{sql}</pre>
        </div>
      )}

      {result.length > 0 && (
        <div className="tabla">
          <h3>Resultados:</h3>
          <table>
            <thead>
              <tr>
                {/* Mostrar los encabezados dinámicamente */}
                {Object.keys(result[0]).map((key) => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Mostrar las filas dinámicamente */}
              {result.map((row, idx) => (
                <tr key={idx}>
                  {Object.values(row).map((val, idx2) => (
                    <td key={idx2}>{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
