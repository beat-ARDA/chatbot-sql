import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [question, setQuestion] = useState("");
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSql("");

    try {
      const res = await axios.post("http://localhost:3001/sql", { question });
      setSql(res.data.sql);
    } catch (err) {
      console.error(err);
      setSql("Error generando la consulta.");
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
    </div>
  );
}

export default App;
