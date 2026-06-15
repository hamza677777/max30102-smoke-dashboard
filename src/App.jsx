import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import "./App.css";

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const supabase = createClient(
  "https://anfvbycrizqhqwaqgnks.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZnZieWNyaXpxaHF3YXFnbmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTc3NDksImV4cCI6MjA5NzAzMzc0OX0.3W13dxVxBC9p9We1Id5d0sWSryWxpdYrk175FKIS5bE"
);

function App() {
  const [latest, setLatest] = useState(null);
  const [records, setRecords] = useState([]);
  const [running, setRunning] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const [theme, setTheme] = useState("hospital");
  const [time, setTime] = useState(new Date());

  const [labels, setLabels] = useState([]);
  const [hrHistory, setHrHistory] = useState([]);
  const [spo2History, setSpo2History] = useState([]);
  const [tempHistory, setTempHistory] = useState([]);

  async function fetchData() {
    const { data, error } = await supabase
      .from("patient_data")
      .select("id, hr, spo2, temp, created_at")
      .order("id", { ascending: false })
      .limit(10);

    if (error) return;

    if (data && data.length > 0) {
      const row = data[0];

      const clean = {
        id: row.id,
        hr: Number(row.hr ?? 0),
        spo2: Number(row.spo2 ?? 0),
        temp: Number(row.temp ?? 0),
        created_at: row.created_at,
      };

      setLatest(clean);
      setRecords(data);

      if (running) {
        setLabels((prev) => [...prev.slice(-17), new Date().toLocaleTimeString()]);
        setHrHistory((prev) => [...prev.slice(-17), clean.hr]);
        setSpo2History((prev) => [...prev.slice(-17), clean.spo2]);
        setTempHistory((prev) => [...prev.slice(-17), clean.temp]);
      }
    }
  }

  useEffect(() => {
    fetchData();
    const dataTimer = setInterval(fetchData, 2000);
    const clockTimer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [running]);

  const hrStatus =
    !latest ? "Waiting" : latest.hr < 50 || latest.hr > 120 ? "Critical" : latest.hr > 100 ? "Warning" : "Normal";

  const spo2Status =
    !latest ? "Waiting" : latest.spo2 < 90 ? "Critical" : latest.spo2 < 95 ? "Warning" : "Normal";

  const tempStatus =
    !latest ? "Waiting" : latest.temp < 35 || latest.temp > 38 ? "Critical" : latest.temp > 37.5 ? "Warning" : "Normal";

  const overallStatus =
    hrStatus === "Critical" || spo2Status === "Critical" || tempStatus === "Critical"
      ? "Critical"
      : hrStatus === "Warning" || spo2Status === "Warning" || tempStatus === "Warning"
      ? "Warning"
      : latest
      ? "Normal"
      : "Waiting";

  function chartData(title, values, color) {
    return {
      labels,
      datasets: [
        {
          label: title,
          data: values,
          borderColor: color,
          backgroundColor: color + "2e",
          fill: true,
          tension: 0.45,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    };
  }

  function chartOptions(min, max, unit) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.y} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          display: false,
          grid: { display: false },
        },
        y: {
          min,
          max,
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
          },
          grid: {
            color: "rgba(148,163,184,0.12)",
          },
        },
      },
    };
  }

  function downloadCSV() {
    let csv = "ID,HR,SpO2,Temp,Time\n";
    records.forEach((r) => {
      csv += `${r.id},${r.hr},${r.spo2},${r.temp},${r.created_at}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "patient_data.csv";
    a.click();
  }

  return (
    <div className={`app ${theme}`}>
      <div className="container">
        <div className="topbar">
          <div>
            <h1>TeleDx Pro</h1>
            <p>Smart Remote Monitoring System</p>
          </div>

          <div className="top-actions">
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="hospital">Hospital Blue</option>
              <option value="black">Black</option>
              <option value="purple">Purple</option>
              <option value="green">Green</option>
            </select>

            <span className="clock">{time.toLocaleTimeString()}</span>

            <span className={running ? "badge live" : "badge pause"}>
              {running ? "LIVE" : "PAUSED"}
            </span>
          </div>
        </div>

        <div className="system-panel">
          <div>
            <span>Device ID</span>
            <b>TDX-001</b>
          </div>

          <div>
            <span>System Mode</span>
            <b>Live Monitoring</b>
          </div>

          <div>
            <span>Connection</span>
            <b>AWS Cloud Connected</b>
          </div>

          <div>
            <span>Overall Status</span>
            <b className={`status-${overallStatus.toLowerCase()}`}>{overallStatus}</b>
          </div>
        </div>

        <div className="vital-cards">
          <div className="vital-card red">
            <span>❤️ Heart Rate</span>
            <h2>{latest ? latest.hr : "--"}</h2>
            <p>BPM</p>
            <small className={`status-${hrStatus.toLowerCase()}`}>{hrStatus}</small>
          </div>

          <div className="vital-card green">
            <span>🫁 SpO₂</span>
            <h2>{latest ? latest.spo2 : "--"}</h2>
            <p>%</p>
            <small className={`status-${spo2Status.toLowerCase()}`}>{spo2Status}</small>
          </div>

          <div className="vital-card orange">
            <span>🌡 Temperature</span>
            <h2>{latest ? latest.temp : "--"}</h2>
            <p>°C</p>
            <small className={`status-${tempStatus.toLowerCase()}`}>{tempStatus}</small>
          </div>

          <div className="vital-card blue">
            <span>📶 Monitoring</span>
            <h2>{running ? "ON" : "OFF"}</h2>
            <p>Cloud Sync</p>
            <small>{running ? "Data receiving" : "Paused"}</small>
          </div>
        </div>

        <div className="range-panel">
          <div><span>HR Normal Range</span><b>60–100 BPM</b></div>
          <div><span>SpO₂ Normal Range</span><b>95–100%</b></div>
          <div><span>Temp Normal Range</span><b>36.5–37.5 °C</b></div>
        </div>

        <div className="graph-panel">
          <div className="graph-header">
            <h3>Live Vital Trends</h3>
            <p>Real-time monitoring of heart rate, oxygen saturation and body temperature</p>
          </div>

          <div className="graphs-grid">
            <div className="graph-card heart">
              <div className="graph-title">
                <span>Heart Rate</span>
                <b>{latest ? latest.hr : "--"} BPM</b>
              </div>
              <div className="chart-box">
                <Line data={chartData("Heart Rate", hrHistory, "#ef4444")} options={chartOptions(40, 150, "BPM")} />
              </div>
            </div>

            <div className="graph-card oxygen">
              <div className="graph-title">
                <span>SpO₂</span>
                <b>{latest ? latest.spo2 : "--"}%</b>
              </div>
              <div className="chart-box">
                <Line data={chartData("SpO₂", spo2History, "#22c55e")} options={chartOptions(85, 100, "%")} />
              </div>
            </div>

            <div className="graph-card temp">
              <div className="graph-title">
                <span>Temperature</span>
                <b>{latest ? latest.temp : "--"} °C</b>
              </div>
              <div className="chart-box">
                <Line data={chartData("Temperature", tempHistory, "#f59e0b")} options={chartOptions(34, 40, "°C")} />
              </div>
            </div>
          </div>
        </div>

        <div className="controls">
          <button onClick={fetchData}>Refresh</button>
          <button onClick={() => setRunning(!running)}>
            {running ? "Stop Monitoring" : "Start Monitoring"}
          </button>
          <button onClick={() => setShowTable(!showTable)}>
            {showTable ? "Hide Supabase Table" : "Show Supabase Table"}
          </button>
          <button onClick={downloadCSV}>Export CSV</button>
          <button onClick={() => window.open("http://localhost:1880/ui", "_blank")}>
            Open Node-RED
          </button>
        </div>

        {showTable && (
          <div className="table-panel">
            <h3>Supabase Latest Records</h3>

            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>HR</th>
                  <th>SpO₂</th>
                  <th>Temp</th>
                  <th>Time</th>
                </tr>
              </thead>

              <tbody>
                {records.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.hr}</td>
                    <td>{row.spo2}</td>
                    <td>{row.temp}</td>
                    <td>{new Date(row.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="footer">
          <span>Database: Supabase Connected</span>
          <span>
            Last Update:{" "}
            {latest?.created_at ? new Date(latest.created_at).toLocaleString() : "Waiting"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;