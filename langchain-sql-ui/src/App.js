import { useState } from "react";
import axios from "axios";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import "./App.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

function App() {
  const [question, setQuestion] = useState("");
  const [sql, setSql] = useState("");
  const [result, setResult] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSql("");
    setResult([]);

    try {
      const res = await axios.post(`${import.meta.env.REACT_APP_API_URL}/sql`, { question });

      setSql(res.data.sql || "No se generó SQL.");
      setResult(res.data.result || []);
    } catch (err) {
      setSql("Error generando la consulta.");
      setResult([]);
    }

    setLoading(false);
  };

  const chartData = result.length > 0 ? {
    labels: result.map((row) => Object.values(row)[0]),
    datasets: [
      {
        label: "Valor",
        data: result.map((row) => Object.values(row)[1]),
        backgroundColor: "rgba(75, 192, 192, 0.5)",
        borderColor: "rgba(75, 192, 192, 1)",
        borderWidth: 1,
      },
    ],
  } : null;

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
                {Object.keys(result[0]).map((key) => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
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

      {chartData && (
        <div style={{ marginTop: 30 }}>
          <h3>📊 Gráfica:</h3>
          <Bar data={chartData} options={{ responsive: true }} />
          {/* Si quieres de líneas cambia <Bar /> por <Line /> */}
        </div>
      )}
    </div>
  );
}

export default App;
