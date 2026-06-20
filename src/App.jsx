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
  const [alarmMuted, setAlarmMuted] = useState(false);

  const [patient, setPatient] = useState(() => {
    const saved = localStorage.getItem("patient_details");
    return saved
      ? JSON.parse(saved)
      : {
          name: "",
          age: "",
          gender: "",
          patientId: "P-001",
          condition: "",
        };
  });

  const [hrHistory, setHrHistory] = useState([]);
  const [spo2History, setSpo2History] = useState([]);
  const [tempHistory, setTempHistory] = useState([]);
  const [ecgHistory, setEcgHistory] = useState([]);
  const [labels, setLabels] = useState([]);

  async function fetchData() {
    const { data, error } = await supabase
      .from("vitals")
      .select("*")
      .order("id", { ascending: false })
      .limit(60);

    if (error) {
      console.log(error);
      return;
    }

    if (data && data.length > 0) {
      const latestRow = data[0];

      const clean = {
        id: latestRow.id,
        device_id: latestRow.device_id || "TDX-001",
        hr: Number(latestRow.heart_rate ?? 0),
        spo2: Number(latestRow.spo2 ?? 0),
        temp: Number(latestRow.body_temp ?? 0),
        ecg: Number(latestRow.ecg_value ?? 0),
        fever: latestRow.fever_status || "Normal",
        hrType: latestRow.hr_status || "Normal",
        rhythm: latestRow.rhythm_status || "Checking",
        health: latestRow.health_status || "Normal",
        created_at: latestRow.created_at,
      };

      setLatest(clean);
      setRecords(data);

      if (running) {
        const ordered = [...data].reverse();

        setLabels(
          ordered.map((r) =>
            new Date(r.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          )
        );

        setHrHistory(ordered.map((r) => Number(r.heart_rate ?? 0)));
        setSpo2History(ordered.map((r) => Number(r.spo2 ?? 0)));
        setTempHistory(ordered.map((r) => Number(r.body_temp ?? 0)));
        setEcgHistory(ordered.map((r) => Number(r.ecg_value ?? 0)));
      }
    }
  }

  useEffect(() => {
    fetchData();
    const dataTimer = setInterval(fetchData, 1500);
    const clockTimer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [running]);

  function updatePatient(field, value) {
    const updated = { ...patient, [field]: value };
    setPatient(updated);
    localStorage.setItem("patient_details", JSON.stringify(updated));
  }

  function statusClass(value) {
    return String(value || "waiting")
      .toLowerCase()
      .replaceAll(" ", "-");
  }

  function getAlarm() {
    if (!latest) {
      return {
        level: "waiting",
        title: "Waiting for Data",
        msg: "No live reading received yet.",
      };
    }

    if (latest.health === "No Finger" || latest.hrType === "No Finger") {
      return {
        level: "sensor",
        title: "Sensor Alert",
        msg: "Place finger on MAX30102 sensor for HR and SpO₂ readings.",
      };
    }

    if (
      latest.health === "Critical" ||
      latest.spo2 < 90 ||
      latest.temp >= 39 ||
      latest.hr > 130 ||
      (latest.hr > 0 && latest.hr < 45)
    ) {
      return {
        level: "critical",
        title: "Critical Alarm",
        msg: "Patient vitals are outside safe range. Immediate attention required.",
      };
    }

    if (
      latest.health === "Warning" ||
      latest.hrType === "Tachy" ||
      latest.hrType === "Brady" ||
      latest.fever === "Fever" ||
      latest.rhythm === "Irregular" ||
      latest.spo2 < 95
    ) {
      return {
        level: "warning",
        title: "Warning Alarm",
        msg: "Vitals need observation. Check sensor placement and patient condition.",
      };
    }

    return {
      level: "normal",
      title: "Normal",
      msg: "All received vitals are within acceptable monitoring range.",
    };
  }

  const alarm = getAlarm();

  const hrStatus = latest?.hrType || "Waiting";
  const spo2Status =
    !latest ? "Waiting" : latest.spo2 === 0 ? "No Finger" : latest.spo2 < 90 ? "Critical" : latest.spo2 < 95 ? "Warning" : "Normal";
  const tempStatus = !latest ? "Waiting" : latest.temp >= 38 ? "Warning" : "Normal";
  const overallStatus = latest?.health || "Waiting";

  function chartData(title, values, color, fill = false) {
    return {
      labels,
      datasets: [
        {
          label: title,
          data: values,
          borderColor: color,
          backgroundColor: fill ? color + "25" : "transparent",
          fill,
          tension: title === "ECG" ? 0.18 : 0.38,
          borderWidth: title === "ECG" ? 2 : 3,
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
            color: "#93a4b8",
            font: { size: 10 },
          },
          grid: {
            color: "rgba(148,163,184,0.12)",
          },
        },
      },
    };
  }

  function downloadCSV() {
    let csv = "ID,Device ID,Patient,HR,SpO2,Temp,ECG,Fever,HR Status,Rhythm,Health,Time\n";

    records.forEach((r) => {
      csv += `${r.id},${r.device_id},${patient.name},${r.heart_rate},${r.spo2},${r.body_temp},${r.ecg_value},${r.fever_status},${r.hr_status},${r.rhythm_status},${r.health_status},${r.created_at}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "teledx_vitals_data.csv";
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

        <div className={`alarm-banner alarm-${alarm.level} ${alarmMuted ? "muted" : ""}`}>
          <div>
            <span className="alarm-dot"></span>
            <b>{alarmMuted ? "Alarm Muted" : alarm.title}</b>
            <p>{alarm.msg}</p>
          </div>

          <button onClick={() => setAlarmMuted(!alarmMuted)}>
            {alarmMuted ? "Unmute Alarm" : "Mute Alarm"}
          </button>
        </div>

        <div className="patient-panel">
          <div className="patient-title">
            <h3>Patient Details</h3>
            <p>Manual entry for current monitoring session</p>
          </div>

          <div className="patient-form">
            <input
              placeholder="Patient Name"
              value={patient.name}
              onChange={(e) => updatePatient("name", e.target.value)}
            />

            <input
              placeholder="Patient ID"
              value={patient.patientId}
              onChange={(e) => updatePatient("patientId", e.target.value)}
            />

            <input
              placeholder="Age"
              value={patient.age}
              onChange={(e) => updatePatient("age", e.target.value)}
            />

            <select value={patient.gender} onChange={(e) => updatePatient("gender", e.target.value)}>
              <option value="">Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            <input
              placeholder="Condition / Notes"
              value={patient.condition}
              onChange={(e) => updatePatient("condition", e.target.value)}
            />
          </div>
        </div>

        <div className="system-panel">
          <div>
            <span>Device ID</span>
            <b>{latest?.device_id || "TDX-001"}</b>
          </div>

          <div>
            <span>Patient</span>
            <b>{patient.name || "Not Entered"}</b>
          </div>

          <div>
            <span>Connection</span>
            <b>AWS Cloud Connected</b>
          </div>

          <div>
            <span>Overall Status</span>
            <b className={`status-${statusClass(overallStatus)}`}>{overallStatus}</b>
          </div>
        </div>

        <div className="vital-cards compact">
          <div className="vital-card red">
            <span>❤️ Heart Rate</span>
            <h2>{latest ? latest.hr : "--"}</h2>
            <p>BPM</p>
            <small className={`status-${statusClass(hrStatus)}`}>{hrStatus}</small>
          </div>

          <div className="vital-card green">
            <span>🫁 SpO₂</span>
            <h2>{latest ? latest.spo2 : "--"}</h2>
            <p>%</p>
            <small className={`status-${statusClass(spo2Status)}`}>{spo2Status}</small>
          </div>

          <div className="vital-card orange">
            <span>🌡 Temperature</span>
            <h2>{latest ? latest.temp : "--"}</h2>
            <p>°C</p>
            <small className={`status-${statusClass(tempStatus)}`}>{tempStatus}</small>
          </div>

          <div className="vital-card blue">
            <span>🫀 ECG Signal</span>
            <h2>{latest ? latest.ecg : "--"}</h2>
            <p>ADC</p>
            <small className={`status-${statusClass(latest?.rhythm || "Waiting")}`}>
              {latest?.rhythm || "Waiting"}
            </small>
          </div>
        </div>

        <div className="mini-status">
          <div><span>Fever</span><b className={`status-${statusClass(latest?.fever)}`}>{latest?.fever || "--"}</b></div>
          <div><span>HR Type</span><b className={`status-${statusClass(latest?.hrType)}`}>{latest?.hrType || "--"}</b></div>
          <div><span>Rhythm</span><b className={`status-${statusClass(latest?.rhythm)}`}>{latest?.rhythm || "--"}</b></div>
          <div><span>Health</span><b className={`status-${statusClass(latest?.health)}`}>{latest?.health || "--"}</b></div>
        </div>

        <div className="graph-panel">
          <div className="graph-header">
            <h3>Live Monitoring Graphs</h3>
            <p>Real-time trends from Supabase live vitals table</p>
          </div>

          <div className="graphs-grid">
            <div className="graph-card heart">
              <div className="graph-title">
                <span>Heart Rate</span>
                <b>{latest ? latest.hr : "--"} BPM</b>
              </div>
              <div className="chart-box">
                <Line data={chartData("Heart Rate", hrHistory, "#ef4444", true)} options={chartOptions(40, 150, "BPM")} />
              </div>
            </div>

            <div className="graph-card oxygen">
              <div className="graph-title">
                <span>SpO₂</span>
                <b>{latest ? latest.spo2 : "--"}%</b>
              </div>
              <div className="chart-box">
                <Line data={chartData("SpO₂", spo2History, "#22c55e", true)} options={chartOptions(85, 100, "%")} />
              </div>
            </div>

            <div className="graph-card temp">
              <div className="graph-title">
                <span>Temperature</span>
                <b>{latest ? latest.temp : "--"} °C</b>
              </div>
              <div className="chart-box">
                <Line data={chartData("Temperature", tempHistory, "#f59e0b", true)} options={chartOptions(34, 40, "°C")} />
              </div>
            </div>

            <div className="graph-card ecg">
              <div className="graph-title">
                <span>ECG Wave</span>
                <b>{latest ? latest.ecg : "--"}</b>
              </div>
              <div className="chart-box">
                <Line data={chartData("ECG", ecgHistory, "#38bdf8", false)} options={chartOptions(1500, 2600, "")} />
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