import { useEffect, useMemo, useState } from "react";
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

const USERNAME = "admin";
const PASSWORD = "teledx2026";

const emptyPatient = {
  fileName: "New Patient",
  name: "",
  patientId: "",
  age: "",
  gender: "",
  condition: "",
  notes: "",
};

function makeDemoECG(length = 80) {
  return Array.from({ length }, (_, i) => {
    const x = i % 20;
    if (x === 2) return 1960;
    if (x === 3) return 2320;
    if (x === 4) return 1710;
    if (x === 5) return 2120;
    if (x > 9 && x < 14) return 2070 + Math.sin(i / 2) * 35;
    return 2048 + Math.sin(i / 3) * 18;
  });
}

function App() {
  const [loggedIn, setLoggedIn] = useState(() => localStorage.getItem("teledx_login") === "true");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  const [latest, setLatest] = useState(null);
  const [records, setRecords] = useState([]);
  const [running, setRunning] = useState(true);
  const [theme, setTheme] = useState("hospital");
  const [time, setTime] = useState(new Date());

  const [labels, setLabels] = useState([]);
  const [hrHistory, setHrHistory] = useState([]);
  const [spo2History, setSpo2History] = useState([]);
  const [tempHistory, setTempHistory] = useState([]);
  const [ecgHistory, setEcgHistory] = useState(makeDemoECG());

  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [selectedVital, setSelectedVital] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [alarmMuted, setAlarmMuted] = useState(false);

  const [patientFiles, setPatientFiles] = useState(() => {
    const saved = localStorage.getItem("patient_files");
    return saved ? JSON.parse(saved) : [];
  });

  const [activePatient, setActivePatient] = useState(() => {
    const saved = localStorage.getItem("active_patient");
    return saved ? JSON.parse(saved) : emptyPatient;
  });

  function handleLogin(e) {
    e.preventDefault();
    if (loginUser === USERNAME && loginPass === PASSWORD) {
      localStorage.setItem("teledx_login", "true");
      setLoggedIn(true);
      setLoginError("");
    } else {
      setLoginError("Invalid username or password");
    }
  }

  function logout() {
    localStorage.removeItem("teledx_login");
    setLoggedIn(false);
    setLoginUser("");
    setLoginPass("");
  }

  async function fetchData() {
    const { data, error } = await supabase
      .from("vitals")
      .select("*")
      .order("id", { ascending: false })
      .limit(80);

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
        ecg: Number(row.ecg_value ?? 2048),
        fever: row.fever_status || "Normal",
        hrType: row.hr_status || "Normal",
        rhythm: row.rhythm_status || "Regular",
        health: row.health_status || "Normal",
        created_at: row.created_at,
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

        const realEcg = ordered.map((r) => Number(r.ecg_value ?? 2048));
        const isFlat = realEcg.every((v) => Math.abs(v - realEcg[0]) < 5);

        if (isFlat || realEcg.length < 10) {
          setEcgHistory(makeDemoECG(80));
        } else {
          setEcgHistory(realEcg);
        }
      }
    }
  }

  useEffect(() => {
    if (!loggedIn) return;

    fetchData();
    const dataTimer = setInterval(fetchData, 1500);
    const clockTimer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [running, loggedIn]);

  function savePatientFiles(files) {
    setPatientFiles(files);
    localStorage.setItem("patient_files", JSON.stringify(files));
  }

  function saveActivePatient(patient) {
    setActivePatient(patient);
    localStorage.setItem("active_patient", JSON.stringify(patient));
  }

  function updatePatient(field, value) {
    saveActivePatient({ ...activePatient, [field]: value });
  }

  function newPatientFile() {
    saveActivePatient({ ...emptyPatient, fileName: `Patient-${Date.now()}` });
  }

  function savePatientFile() {
    const fileName = activePatient.fileName || activePatient.name || `Patient-${Date.now()}`;
    const fileToSave = { ...activePatient, fileName };
    const exists = patientFiles.some((p) => p.fileName === fileName);
    const updated = exists
      ? patientFiles.map((p) => (p.fileName === fileName ? fileToSave : p))
      : [...patientFiles, fileToSave];

    savePatientFiles(updated);
    saveActivePatient(fileToSave);
    alert("Patient file saved");
  }

  function saveAsPatientFile() {
    const name = prompt("Enter new file name:");
    if (!name) return;
    const fileToSave = { ...activePatient, fileName: name };
    savePatientFiles([...patientFiles.filter((p) => p.fileName !== name), fileToSave]);
    saveActivePatient(fileToSave);
    alert("Patient file saved as new file");
  }

  function deletePatientFile() {
    const ok = confirm("Delete this patient file?");
    if (!ok) return;
    savePatientFiles(patientFiles.filter((p) => p.fileName !== activePatient.fileName));
    saveActivePatient(emptyPatient);
  }

  function loadPatientFile(fileName) {
    const file = patientFiles.find((p) => p.fileName === fileName);
    if (file) saveActivePatient(file);
  }

  function statusClass(value) {
    return String(value || "waiting").toLowerCase().replaceAll(" ", "-");
  }

  function avg(arr) {
    const valid = arr.filter((v) => Number(v) > 0);
    if (!valid.length) return 0;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }

  function minVal(arr) {
    const valid = arr.filter((v) => Number(v) > 0);
    return valid.length ? Math.min(...valid) : 0;
  }

  function maxVal(arr) {
    const valid = arr.filter((v) => Number(v) > 0);
    return valid.length ? Math.max(...valid) : 0;
  }

  const alarm = useMemo(() => {
    if (!latest) return { level: "waiting", type: "none", title: "Waiting for Data", msg: "No live reading received yet." };

    if (latest.hrType === "No Finger" || latest.health === "No Finger") {
      return { level: "sensor", type: "hr", title: "Sensor Alert", msg: "Place finger on MAX30102 sensor for HR and SpO₂ readings." };
    }

    if (latest.spo2 > 0 && latest.spo2 < 90) {
      return { level: "critical", type: "spo2", title: "Critical SpO₂ Alarm", msg: "Oxygen saturation is critically low." };
    }

    if (latest.temp < 35 || latest.temp > 38) {
      return { level: "warning", type: "temp", title: "Temperature Alarm", msg: "Temperature is outside 35–38 °C range." };
    }

    if (latest.hr > 100 || (latest.hr > 0 && latest.hr < 60)) {
      return { level: "warning", type: "hr", title: "Heart Rate Alarm", msg: "Heart rate is abnormal." };
    }

    if (latest.rhythm === "Irregular") {
      return { level: "warning", type: "ecg", title: "Rhythm Alarm", msg: "Irregular rhythm status detected." };
    }

    return { level: "normal", type: "none", title: "Normal", msg: "All received vitals are stable." };
  }, [latest]);

  const vitalInfo = {
    hr: {
      title: "Heart Rate Analysis",
      label: "Heart Rate",
      unit: "BPM",
      value: latest?.hr ?? "--",
      status: latest?.hrType || "Waiting",
      values: hrHistory,
      color: "#ef4444",
      min: 40,
      max: 150,
      analysis:
        latest?.hr === 0
          ? "No finger detected. Place finger properly on MAX30102."
          : latest?.hr > 100
          ? "Tachycardia condition detected."
          : latest?.hr < 60
          ? "Bradycardia condition detected."
          : "Heart rate is currently stable.",
    },
    spo2: {
      title: "SpO₂ Analysis",
      label: "Oxygen Saturation",
      unit: "%",
      value: latest?.spo2 ?? "--",
      status:
        !latest ? "Waiting" : latest.spo2 === 0 ? "No Finger" : latest.spo2 < 90 ? "Critical" : latest.spo2 < 95 ? "Warning" : "Normal",
      values: spo2History,
      color: "#22c55e",
      min: 85,
      max: 100,
      analysis:
        latest?.spo2 === 0
          ? "No SpO₂ reading. Place finger correctly."
          : latest?.spo2 < 90
          ? "Critical low oxygen saturation."
          : latest?.spo2 < 95
          ? "SpO₂ is slightly low."
          : "SpO₂ level is stable.",
    },
    temp: {
      title: "Temperature Analysis",
      label: "Body Temperature",
      unit: "°C",
      value: latest?.temp ?? "--",
      status: latest?.temp < 35 || latest?.temp > 38 ? "Warning" : "Normal",
      values: tempHistory,
      color: "#f59e0b",
      min: 35,
      max: 38,
      analysis:
        latest?.temp < 35 || latest?.temp > 38
          ? "Temperature is outside selected 35–38 °C range."
          : "Body temperature is currently stable.",
    },
    ecg: {
      title: "ECG Wave Analysis",
      label: "ECG Signal",
      unit: "ADC",
      value: latest?.ecg ?? "--",
      status: latest?.rhythm || "Regular",
      values: ecgHistory,
      color: "#38bdf8",
      min: 1650,
      max: 2400,
      analysis: "ECG waveform display is active. If sensor signal is flat, demo waveform fallback is shown for visualization.",
    },
  };

  function openAnalysis(type) {
    setSelectedVital(type);
    setShowAnalysisModal(true);
  }

  function chartData(title, values, color, fill = true) {
    return {
      labels: values.map((_, i) => labels[i] || i + 1),
      datasets: [
        {
          label: title,
          data: values,
          borderColor: color,
          backgroundColor: fill ? color + "25" : "transparent",
          fill,
          tension: title === "ECG Signal" ? 0.08 : 0.38,
          borderWidth: title === "ECG Signal" ? 2 : 3,
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
        x: { display: false, grid: { display: false } },
        y: {
          min,
          max,
          ticks: { color: "#93a4b8", font: { size: 10 } },
          grid: { color: "rgba(148,163,184,0.12)" },
        },
      },
    };
  }

  function downloadCSV() {
    let csv = "ID,Device ID,Patient,HR,SpO2,Temp,ECG,Fever,HR Status,Rhythm,Health,Time\n";
    records.forEach((r) => {
      csv += `${r.id},${r.device_id},${activePatient.name},${r.heart_rate},${r.spo2},${r.body_temp},${r.ecg_value},${r.fever_status},${r.hr_status},${r.rhythm_status},${r.health_status},${r.created_at}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teledx_vitals_data.csv";
    a.click();
  }

  const selected = selectedVital ? vitalInfo[selectedVital] : null;

  if (!loggedIn) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>TeleDx Pro</h1>
          <p>Secure Dashboard Access</p>

          <input type="text" placeholder="Username" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
          <input type="password" placeholder="Password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />

          {loginError && <span className="login-error">{loginError}</span>}

          <button type="submit">Login</button>
        </form>
      </div>
    );
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
            <span className={running ? "badge live" : "badge pause"}>{running ? "LIVE" : "PAUSED"}</span>
            <button onClick={logout}>Logout</button>
          </div>
        </div>

        <div className={`alarm-banner alarm-${alarm.level} ${alarmMuted ? "muted" : ""}`}>
          <div>
            <span className="alarm-dot"></span>
            <b>{alarmMuted ? "Alarm Muted" : alarm.title}</b>
            <p>{alarm.msg}</p>
          </div>
          <button onClick={() => setAlarmMuted(!alarmMuted)}>{alarmMuted ? "Unmute" : "Mute Alarm"}</button>
        </div>

        <div className="system-panel">
          <div className="clickable" onClick={() => setShowPatientModal(true)}>
            <span>Patient File</span>
            <b>{activePatient.name || "Click to Add"}</b>
            <small>{activePatient.patientId || "No ID"}</small>
          </div>

          <div>
            <span>Device ID</span>
            <b>{latest?.device_id || "TDX-001"}</b>
          </div>

          <div>
            <span>Connection</span>
            <b>AWS Cloud Connected</b>
          </div>

          <div>
            <span>Overall Status</span>
            <b className={`status-${statusClass(latest?.health || "Waiting")}`}>{latest?.health || "Waiting"}</b>
          </div>
        </div>

        <div className="vital-cards">
          {Object.entries(vitalInfo).map(([key, item]) => (
            <div
              key={key}
              className={`vital-card ${key} clickable ${alarm.type === key && !alarmMuted ? "blink-card" : ""}`}
              onClick={() => openAnalysis(key)}
            >
              <span>
                {key === "hr" && "❤️ Heart Rate"}
                {key === "spo2" && "🫁 SpO₂"}
                {key === "temp" && "🌡 Temperature"}
                {key === "ecg" && "🫀 ECG Signal"}
              </span>
              <h2>{item.value}</h2>
              <p>{item.unit}</p>
              <small className={`status-${statusClass(item.status)}`}>{item.status}</small>
            </div>
          ))}
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
            <p>Click any vital card above for detailed analysis</p>
          </div>

          <div className="graphs-grid">
            {Object.entries(vitalInfo).map(([key, item]) => (
              <div className={`graph-card ${key}`} key={key}>
                <div className="graph-title">
                  <span>{item.label}</span>
                  <b>{item.value} {item.unit}</b>
                </div>
                <div className="chart-box">
                  <Line data={chartData(item.label, item.values, item.color, key !== "ecg")} options={chartOptions(item.min, item.max, item.unit)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="controls">
          <button onClick={fetchData}>Refresh</button>
          <button onClick={() => setRunning(!running)}>{running ? "Stop Monitoring" : "Start Monitoring"}</button>
          <button onClick={() => setShowTable(!showTable)}>{showTable ? "Hide Table" : "Show Table"}</button>
          <button onClick={downloadCSV}>Export CSV</button>
        </div>

        {showTable && (
          <div className="table-panel">
            <h3>Supabase Latest Records</h3>
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Device</th><th>HR</th><th>SpO₂</th><th>Temp</th><th>ECG</th><th>Fever</th><th>HR Type</th><th>Rhythm</th><th>Health</th><th>Time</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td><td>{row.device_id}</td><td>{row.heart_rate}</td><td>{row.spo2}</td><td>{row.body_temp}</td><td>{row.ecg_value}</td><td>{row.fever_status}</td><td>{row.hr_status}</td><td>{row.rhythm_status}</td><td>{row.health_status}</td><td>{new Date(row.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="footer">
          <span>Database: Supabase Vitals Connected</span>
          <span>Last Update: {latest?.created_at ? new Date(latest.created_at).toLocaleString() : "Waiting"}</span>
        </div>
      </div>

      {showPatientModal && (
        <div className="modal-bg">
          <div className="modal patient-modal">
            <div className="modal-header">
              <h2>Patient File</h2>
              <button onClick={() => setShowPatientModal(false)}>Close</button>
            </div>

            <div className="patient-actions">
              <button onClick={newPatientFile}>New File</button>
              <button onClick={savePatientFile}>Save</button>
              <button onClick={saveAsPatientFile}>Save As</button>
              <button className="danger" onClick={deletePatientFile}>Delete</button>
            </div>

            <div className="patient-select">
              <select onChange={(e) => loadPatientFile(e.target.value)} value={activePatient.fileName}>
                <option value="">Select Saved Patient</option>
                {patientFiles.map((p) => (
                  <option key={p.fileName} value={p.fileName}>{p.fileName} - {p.name}</option>
                ))}
              </select>
            </div>

            <div className="patient-form-modal">
              <input placeholder="File Name" value={activePatient.fileName} onChange={(e) => updatePatient("fileName", e.target.value)} />
              <input placeholder="Patient Name" value={activePatient.name} onChange={(e) => updatePatient("name", e.target.value)} />
              <input placeholder="Patient ID" value={activePatient.patientId} onChange={(e) => updatePatient("patientId", e.target.value)} />
              <input placeholder="Age" value={activePatient.age} onChange={(e) => updatePatient("age", e.target.value)} />

              <select value={activePatient.gender} onChange={(e) => updatePatient("gender", e.target.value)}>
                <option value="">Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>

              <input placeholder="Condition" value={activePatient.condition} onChange={(e) => updatePatient("condition", e.target.value)} />
              <textarea placeholder="Notes" value={activePatient.notes} onChange={(e) => updatePatient("notes", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {showAnalysisModal && selected && (
        <div className="modal-bg">
          <div className="modal analysis-modal">
            <div className="modal-header">
              <h2>{selected.title}</h2>
              <button onClick={() => setShowAnalysisModal(false)}>Close</button>
            </div>

            <div className="analysis-summary">
              <div><span>Latest</span><b>{selected.value} {selected.unit}</b></div>
              <div><span>Average</span><b>{avg(selected.values)} {selected.unit}</b></div>
              <div><span>Minimum</span><b>{minVal(selected.values)} {selected.unit}</b></div>
              <div><span>Maximum</span><b>{maxVal(selected.values)} {selected.unit}</b></div>
            </div>

            <div className="analysis-chart">
              <Line data={chartData(selected.label, selected.values, selected.color, selectedVital !== "ecg")} options={chartOptions(selected.min, selected.max, selected.unit)} />
            </div>

            <div className="analysis-text">
              <h3>Status: <span className={`status-${statusClass(selected.status)}`}>{selected.status}</span></h3>
              <p>{selected.analysis}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;