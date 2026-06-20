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

  const [hrHistory, setHrHistory] = useState([]);
  const [spo2History, setSpo2History] = useState([]);
  const [tempHistory, setTempHistory] = useState([]);
  const [ecgHistory, setEcgHistory] = useState([]);

  async function fetchData() {
    const { data, error } = await supabase
      .from("vitals")
      .select("*")
      .order("id", { ascending: false })
      .limit(30);

    if (error) {
      console.log(error);
      return;
    }

    if (data && data.length > 0) {
      const row = data[0];

      const clean = {
        id: row.id,
        device_id: row.device_id || "TDX-001",
        hr: Number(row.heart_rate ?? 0),
        spo2: Number(row.spo2 ?? 0),
        temp: Number(row.body_temp ?? 0),
        ecg: Number(row.ecg_value ?? 0),
        fever: row.fever_status || "Normal",
        hrType: row.hr_status || "Normal",
        rhythm: row.rhythm_status || "Checking",
        health: row.health_status || "Normal",
        created_at: row.created_at,
      };

      setLatest(clean);
      setRecords(data);

      if (running) {
        setHrHistory((prev) => [...prev.slice(-29), clean.hr]);
        setSpo2History((prev) => [...prev.slice(-29), clean.spo2]);
        setTempHistory((prev) => [...prev.slice(-29), clean.temp]);
        setEcgHistory((prev) => [...prev.slice(-79), clean.ecg]);
      }
    }
  }

  useEffect(() => {
    fetchData();

    const dataTimer = setInterval(fetchData, 1000);
    const clockTimer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [running]);

  const hrStatus = latest?.hrType || "Waiting";

  const spo2Status =
    !latest ? "Waiting" : latest.spo2 < 90 ? "Critical" : latest.spo2 < 95 ? "Warning" : "Normal";

  const tempStatus =
    !latest ? "Waiting" : latest.temp >= 38 ? "Warning" : "Normal";

  const overallStatus = latest?.health || "Waiting";

  function chartData(title, values, color, fill = true) {
    return {
      labels: values.map((_, i) => i + 1),
      datasets: [
        {
          label: title,
          data: values,
          borderColor: color,
          backgroundColor: fill ? color + "2e" : "transparent",
          fill: fill,
          tension: title === "ECG" ? 0.15 : 0.45,
          borderWidth: title === "ECG" ? 2 : 3,
          pointRadius: 0,
          pointHoverRadius: 3,
        },
      ],
    };
  }

  function chartOptions(min, max, unit) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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
    let csv = "ID,Device ID,HR,SpO2,Temp,ECG,Fever,HR Status,Rhythm,Health,Time\n";

    records.forEach((r) => {
      csv += `${r.id},${r.device_id},${r.heart_rate},${r.spo2},${r.body_temp},${r.ecg_value},${r.fever_status},${r.hr_status},${r.rhythm_status},${r.health_status},${r.created_at}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "vitals_data.csv";
    a.click();
  }

  return (
    <div className={`app ${theme}`}>
      <div className="container">
        <div className="topbar">
          <div>
            <h1>TeleDx Pro</h1>
            <p>Portable Telemedicine Diagnostic & Remote Monitoring System</p>
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
            <b>{latest?.device_id || "TDX-001"}</b>
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
            <span>🫀 ECG Signal</span>
            <h2>{latest ? latest.ecg : "--"}</h2>
            <p>ADC Value</p>
            <small>{latest?.rhythm || "Waiting"}</small>
          </div>
        </div>

        <div className="range-panel">
          <div><span>HR Normal Range</span><b>60–100 BPM</b></div>
          <div><span>SpO₂ Normal Range</span><b>95–100%</b></div>
          <div><span>Temp Normal Range</span><b>36.5–37.5 °C</b></div>
          <div><span>ECG ADC Range</span><b>1500–2600</b></div>
        </div>

        <div className="range-panel">
          <div><span>Fever Status</span><b>{latest?.fever || "--"}</b></div>
          <div><span>HR Type</span><b>{latest?.hrType || "--"}</b></div>
          <div><span>Rhythm</span><b>{latest?.rhythm || "--"}</b></div>
          <div><span>Health Status</span><b>{latest?.health || "--"}</b></div>
        </div>

        <div className="graph-panel">
          <div className="graph-header">
            <h3>Live Vital Trends</h3>
            <p>Real-time HR, SpO₂, temperature and ECG monitoring</p>
          </div>

          <div className="graphs-grid">
            <div className="graph-card heart">
              <div className="graph-title">
                <span>Heart Rate</span>
                <b>{latest ? latest.hr : "--"} BPM</b>
              </div>
              <div className="chart-box">
                <Line
                  data={chartData("Heart Rate", hrHistory, "#ef4444")}
                  options={chartOptions(40, 150, "BPM")}
                />
              </div>
            </div>

            <div className="graph-card oxygen">
              <div className="graph-title">
                <span>SpO₂</span>
                <b>{latest ? latest.spo2 : "--"}%</b>
              </div>
              <div className="chart-box">
                <Line
                  data={chartData("SpO₂", spo2History, "#22c55e")}
                  options={chartOptions(85, 100, "%")}
                />
              </div>
            </div>

            <div className="graph-card temp">
              <div className="graph-title">
                <span>Temperature</span>
                <b>{latest ? latest.temp : "--"} °C</b>
              </div>
              <div className="chart-box">
                <Line
                  data={chartData("Temperature", tempHistory, "#f59e0b")}
                  options={chartOptions(34, 40, "°C")}
                />
              </div>
            </div>

            <div className="graph-card ecg">
              <div className="graph-title">
                <span>ECG Wave</span>
                <b>{latest ? latest.ecg : "--"}</b>
              </div>
              <div className="chart-box">
                <Line
                  data={chartData("ECG", ecgHistory, "#3b82f6", false)}
                  options={chartOptions(1500, 2600, "")}
                />
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
                  <th>Device</th>
                  <th>HR</th>
                  <th>SpO₂</th>
                  <th>Temp</th>
                  <th>ECG</th>
                  <th>Fever</th>
                  <th>HR Type</th>
                  <th>Rhythm</th>
                  <th>Health</th>
                  <th>Time</th>
                </tr>
              </thead>

              <tbody>
                {records.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.device_id}</td>
                    <td>{row.heart_rate}</td>
                    <td>{row.spo2}</td>
                    <td>{row.body_temp}</td>
                    <td>{row.ecg_value}</td>
                    <td>{row.fever_status}</td>
                    <td>{row.hr_status}</td>
                    <td>{row.rhythm_status}</td>
                    <td>{row.health_status}</td>
                    <td>{new Date(row.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="footer">
          <span>Database: Supabase Vitals Connected</span>
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