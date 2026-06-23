import { useEffect, useMemo, useRef, useState } from "react";
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

const USERS = {
  admin: { password: "admin123", role: "admin", name: "Admin" },
  doctor: { password: "doctor123", role: "doctor", name: "Doctor" },
  patient: { password: "patient123", role: "patient", name: "Patient" },
};

const MAX_POINTS = 40;
const MAX_ECG_POINTS = 250;

const emptyPatient = {
  fileName: "New Patient",
  name: "",
  patientId: "",
  age: "",
  gender: "",
  condition: "",
  notes: "",
};

function zeros(n) {
  return Array.from({ length: n }, () => 0);
}

function cleanEcgSamples(samples) {
  return samples
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v))
    .map((v) => {
      if (v <= 50 || v >= 4090) return 2048;
      if (v < 900) return 900;
      if (v > 3200) return 3200;
      return v;
    });
}

function App() {
  const chartRef = useRef(null);
  const lastIdRef = useRef(null);

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("teledx_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  const [latest, setLatest] = useState(null);
  const [records, setRecords] = useState([]);
  const [running, setRunning] = useState(true);
  const [time, setTime] = useState(new Date());

  const [hrHistory, setHrHistory] = useState(zeros(MAX_POINTS));
  const [spo2History, setSpo2History] = useState(zeros(MAX_POINTS));
  const [tempHistory, setTempHistory] = useState(zeros(MAX_POINTS));
  const [ecgHistory, setEcgHistory] = useState(zeros(MAX_ECG_POINTS).map(() => 2048));

  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [selectedVital, setSelectedVital] = useState(null);
  const [alarmMuted, setAlarmMuted] = useState(false);

  const [patientFiles, setPatientFiles] = useState(() => {
    const saved = localStorage.getItem("patient_files");
    return saved ? JSON.parse(saved) : [];
  });

  const [activePatient, setActivePatient] = useState(() => {
    const saved = localStorage.getItem("active_patient");
    return saved ? JSON.parse(saved) : emptyPatient;
  });

  const role = user?.role;

  const canManagePatients = role === "admin" || role === "doctor";
  const canExport = role === "admin" || role === "doctor";
  const canSeeTable = role === "admin" || role === "doctor";
  const canDelete = role === "admin";

  function handleLogin(e) {
    e.preventDefault();

    const found = USERS[loginUser];

    if (found && found.password === loginPass) {
      const loginData = {
        username: loginUser,
        role: found.role,
        name: found.name,
      };

      localStorage.setItem("teledx_user", JSON.stringify(loginData));
      setUser(loginData);
      setLoginError("");
    } else {
      setLoginError("Invalid username or password");
    }
  }

  function logout() {
    localStorage.removeItem("teledx_user");
    setUser(null);
  }

  function pushPoint(setter, value) {
    setter((old) => [...old.slice(1), Number(value || 0)]);
  }

  function pushEcgSamples(samples) {
    const cleaned = cleanEcgSamples(samples);
    if (!cleaned.length) return;

    setEcgHistory((old) => {
      const next = [...old, ...cleaned];
      return next.slice(-MAX_ECG_POINTS);
    });
  }

  async function fetchData() {
    const { data, error } = await supabase
      .from("vitals")
      .select("*")
      .order("id", { ascending: false })
      .limit(100);

    if (error || !data || data.length === 0) {
      console.log(error);
      return;
    }

    const row = data[0];

    const clean = {
      id: row.id,
      device_id: row.device_id || "TDX-001",
      hr: Number(row.heart_rate ?? 0),
      spo2: Number(row.spo2 ?? 0),
      temp: Number(row.body_temp ?? 0),
      ecg: Number(row.ecg_value ?? 2048),
      ecgSamples: Array.isArray(row.ecg_samples) ? row.ecg_samples : [],
      fever: row.fever_status || "Normal",
      hrType: row.hr_status || "Normal",
      rhythm: row.rhythm_status || "Normal",
      health: row.health_status || "Normal",
      created_at: row.created_at,
    };

    setLatest(clean);
    setRecords(data);

    if (running && lastIdRef.current !== clean.id) {
      lastIdRef.current = clean.id;

      pushPoint(setHrHistory, clean.hr);
      pushPoint(setSpo2History, clean.spo2);
      pushPoint(setTempHistory, clean.temp);

      if (clean.ecgSamples.length > 3) {
        pushEcgSamples(clean.ecgSamples);
      } else {
        pushEcgSamples([clean.ecg]);
      }
    }
  }

  useEffect(() => {
    if (!user) return;

    fetchData();
    const dataTimer = setInterval(fetchData, 1000);
    const clockTimer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [running, user]);

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
    const fileToSave = {
      ...activePatient,
      fileName,
      lastSaved: new Date().toLocaleString(),
      lastVitals: latest,
      history: records.slice(0, 30),
    };

    const exists = patientFiles.some((p) => p.fileName === fileName);

    const updated = exists
      ? patientFiles.map((p) => (p.fileName === fileName ? fileToSave : p))
      : [...patientFiles, fileToSave];

    savePatientFiles(updated);
    saveActivePatient(fileToSave);
    alert("Patient data saved");
  }

  function saveAsPatientFile() {
    const name = prompt("Enter new file name:");
    if (!name) return;

    const fileToSave = {
      ...activePatient,
      fileName: name,
      lastSaved: new Date().toLocaleString(),
      lastVitals: latest,
      history: records.slice(0, 30),
    };

    savePatientFiles([...patientFiles.filter((p) => p.fileName !== name), fileToSave]);
    saveActivePatient(fileToSave);
    alert("Saved as new patient file");
  }

  function deletePatientFile() {
    if (!canDelete) return alert("Only admin can delete patient files.");
    if (!confirm("Delete this patient file?")) return;

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

  function chartData(title, values, color, fill = true) {
    return {
      labels: values.map((_, i) => i),
      datasets: [
        {
          label: title,
          data: values,
          borderColor: color,
          backgroundColor: fill ? color + "22" : "transparent",
          fill,
          tension: title === "ECG Signal" ? 0.04 : 0.4,
          borderWidth: title === "ECG Signal" ? 2 : 3,
          pointRadius: 0,
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
          display: true,
          ticks: { color: "#64748b", maxTicksLimit: 6 },
          grid: { display: false },
        },
        y: {
          min,
          max,
          ticks: { color: "#93a4b8", font: { size: 10 } },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
      },
    };
  }

  function downloadCSV() {
    if (!canExport) return alert("Only admin and doctor can export data.");

    let csv =
      "ID,Device ID,Patient,HR,SpO2,Temp,ECG,Fever,HR Status,Rhythm,Health,Time\n";

    records.forEach((r) => {
      csv += `${r.id},${r.device_id},${activePatient.name},${r.heart_rate},${r.spo2},${r.body_temp},${r.ecg_value},${r.fever_status},${r.hr_status},${r.rhythm_status},${r.health_status},${r.created_at}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "teledx_patient_data.csv";
    a.click();
  }

  function saveGraph() {
    if (!chartRef.current) return;

    const link = document.createElement("a");
    link.download = `${selectedVital || "vital"}_graph.png`;
    link.href = chartRef.current.toBase64Image();
    link.click();
  }

  const alarm = useMemo(() => {
    if (!latest) {
      return {
        level: "waiting",
        type: "none",
        title: "Waiting for Data",
        msg: "No live reading received yet.",
      };
    }

    if (latest.hrType === "No Finger" || latest.health === "No Finger") {
      return {
        level: "sensor",
        type: "hr",
        title: "Sensor Alert",
        msg: "Place finger on MAX30102 sensor.",
      };
    }

    if (latest.spo2 > 0 && latest.spo2 < 90) {
      return {
        level: "critical",
        type: "spo2",
        title: "Critical SpO₂ Alarm",
        msg: "Oxygen saturation is critically low.",
      };
    }

    if (latest.temp < 35 || latest.temp > 38) {
      return {
        level: "warning",
        type: "temp",
        title: "Temperature Alarm",
        msg: "Temperature is outside normal range.",
      };
    }

    if (latest.hr > 100 || (latest.hr > 0 && latest.hr < 60)) {
      return {
        level: "warning",
        type: "hr",
        title: "Heart Rate Alarm",
        msg: "Heart rate is abnormal.",
      };
    }

    return {
      level: "normal",
      type: "none",
      title: "Normal",
      msg: "All received vitals are stable.",
    };
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
      min: 0,
      max: 160,
    },
    spo2: {
      title: "SpO₂ Analysis",
      label: "Oxygen Saturation",
      unit: "%",
      value: latest?.spo2 ?? "--",
      status: !latest
        ? "Waiting"
        : latest.spo2 === 0
        ? "No Finger"
        : latest.spo2 < 90
        ? "Critical"
        : latest.spo2 < 95
        ? "Warning"
        : "Normal",
      values: spo2History,
      color: "#22c55e",
      min: 0,
      max: 100,
    },
    temp: {
      title: "Temperature Analysis",
      label: "Body Temperature",
      unit: "°C",
      value: latest?.temp ?? "--",
      status: latest?.temp < 35 || latest?.temp > 38 ? "Warning" : "Normal",
      values: tempHistory,
      color: "#f59e0b",
      min: 0,
      max: 45,
    },
    ecg: {
      title: "Real-Time ECG Wave",
      label: "ECG Signal",
      unit: "ADC",
      value: latest?.ecg ?? "--",
      status: latest?.rhythm || "Normal",
      values: ecgHistory,
      color: "#38bdf8",
      min: 900,
      max: 3200,
    },
  };

  function openAnalysis(type) {
    setSelectedVital(type);
    setShowAnalysisModal(true);
  }

  const selected = selectedVital ? vitalInfo[selectedVital] : null;

  if (!user) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>TeleDx Pro</h1>
          <p>Admin / Doctor / Patient Login</p>

          <input
            type="text"
            placeholder="Username: admin / doctor / patient"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
          />

          {loginError && <span className="login-error">{loginError}</span>}

          <button type="submit">Login</button>

          <small>
            Admin: admin123 | Doctor: doctor123 | Patient: patient123
          </small>
        </form>
      </div>
    );
  }

  return (
    <div className={`app role-${role}`}>
      <div className="container">
        <div className="topbar">
          <div>
            <h1>TeleDx Pro</h1>
            <p>Portable Telemedicine Diagnostic & Remote Monitoring System</p>
          </div>

          <div className="top-actions">
            <span className="role-badge">{role?.toUpperCase()}</span>
            <span className="clock">{time.toLocaleTimeString()}</span>
            <span className={running ? "badge live" : "badge pause"}>
              {running ? "LIVE" : "PAUSED"}
            </span>
            <button onClick={logout}>Logout</button>
          </div>
        </div>

        <div className={`alarm-banner alarm-${alarm.level} ${alarmMuted ? "muted" : ""}`}>
          <div>
            <span className="alarm-dot"></span>
            <b>{alarmMuted ? "Alarm Muted" : alarm.title}</b>
            <p>{alarm.msg}</p>
          </div>

          {(role === "admin" || role === "doctor") && (
            <button onClick={() => setAlarmMuted(!alarmMuted)}>
              {alarmMuted ? "Unmute" : "Mute Alarm"}
            </button>
          )}
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
            <b className={`status-${statusClass(latest?.health || "Waiting")}`}>
              {latest?.health || "Waiting"}
            </b>
          </div>
        </div>

        <div className="vital-cards">
          {Object.entries(vitalInfo).map(([key, item]) => (
            <div
              key={key}
              className={`vital-card ${key} clickable ${
                alarm.type === key && !alarmMuted ? "blink-card" : ""
              }`}
              onClick={() => openAnalysis(key)}
            >
              <span>
                {key === "hr"
                  ? "❤️ Heart Rate"
                  : key === "spo2"
                  ? "🫁 SpO₂"
                  : key === "temp"
                  ? "🌡 Temperature"
                  : "🫀 ECG Signal"}
              </span>
              <h2>{item.value}</h2>
              <p>{item.unit}</p>
              <small className={`status-${statusClass(item.status)}`}>
                {item.status}
              </small>
            </div>
          ))}
        </div>

        <div className="mini-status">
          <div>
            <span>Fever</span>
            <b className={`status-${statusClass(latest?.fever)}`}>
              {latest?.fever || "--"}
            </b>
          </div>

          <div>
            <span>HR Type</span>
            <b className={`status-${statusClass(latest?.hrType)}`}>
              {latest?.hrType || "--"}
            </b>
          </div>

          <div>
            <span>Rhythm</span>
            <b className={`status-${statusClass(latest?.rhythm)}`}>
              {latest?.rhythm || "--"}
            </b>
          </div>

          <div>
            <span>Health</span>
            <b className={`status-${statusClass(latest?.health)}`}>
              {latest?.health || "--"}
            </b>
          </div>
        </div>

        <div className="graph-panel">
          <div className="graph-header">
            <h3>Live Monitoring Graphs</h3>
            <p>ECG wave is shown from live AD8232 samples sent by ESP32.</p>
          </div>

          <div className="graphs-grid">
            {Object.entries(vitalInfo).map(([key, item]) => (
              <div
                className={`graph-card ${key}`}
                key={key}
                onClick={() => openAnalysis(key)}
              >
                <div className="graph-title">
                  <span>{item.label}</span>
                  <b>
                    {item.value} {item.unit}
                  </b>
                </div>

                <div className={key === "ecg" ? "chart-box ecg-box" : "chart-box"}>
                  <Line
                    data={chartData(item.label, item.values, item.color, key !== "ecg")}
                    options={chartOptions(item.min, item.max, item.unit)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="controls">
          <button onClick={fetchData}>Refresh</button>
          <button onClick={() => setRunning(!running)}>
            {running ? "Stop Monitoring" : "Start Monitoring"}
          </button>

          <button onClick={savePatientFile}>Save Patient Data</button>

          {canSeeTable && (
            <button onClick={() => setShowTable(!showTable)}>
              {showTable ? "Hide Table" : "Show Table"}
            </button>
          )}

          {canExport && <button onClick={downloadCSV}>Export CSV</button>}
        </div>

        {showTable && canSeeTable && (
          <div className="table-panel">
            <h3>Saved Supabase Records</h3>

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

        <div className="saved-panel">
          <h3>Saved Patient Files</h3>

          {patientFiles.length === 0 ? (
            <p>No saved patient file yet.</p>
          ) : (
            <div className="saved-grid">
              {patientFiles.map((p) => (
                <div className="saved-card" key={p.fileName}>
                  <h4>{p.fileName}</h4>
                  <p>{p.name || "Unnamed Patient"}</p>
                  <small>{p.lastSaved || "Not saved yet"}</small>
                  <button onClick={() => loadPatientFile(p.fileName)}>Open</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="footer">
          <span>Database: Supabase Vitals Connected</span>
          <span>
            Last Update:{" "}
            {latest?.created_at
              ? new Date(latest.created_at).toLocaleString()
              : "Waiting"}
          </span>
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
              {canManagePatients && <button onClick={newPatientFile}>New File</button>}
              <button onClick={savePatientFile}>Save</button>
              {canManagePatients && <button onClick={saveAsPatientFile}>Save As</button>}
              {canDelete && (
                <button className="danger" onClick={deletePatientFile}>
                  Delete
                </button>
              )}
            </div>

            <div className="patient-select">
              <select
                onChange={(e) => loadPatientFile(e.target.value)}
                value={activePatient.fileName}
              >
                <option value="">Select Saved Patient</option>
                {patientFiles.map((p) => (
                  <option key={p.fileName} value={p.fileName}>
                    {p.fileName} - {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="patient-form-modal">
              <input
                placeholder="File Name"
                value={activePatient.fileName}
                disabled={role === "patient"}
                onChange={(e) => updatePatient("fileName", e.target.value)}
              />

              <input
                placeholder="Patient Name"
                value={activePatient.name}
                disabled={role === "patient"}
                onChange={(e) => updatePatient("name", e.target.value)}
              />

              <input
                placeholder="Patient ID"
                value={activePatient.patientId}
                disabled={role === "patient"}
                onChange={(e) => updatePatient("patientId", e.target.value)}
              />

              <input
                placeholder="Age"
                value={activePatient.age}
                disabled={role === "patient"}
                onChange={(e) => updatePatient("age", e.target.value)}
              />

              <select
                value={activePatient.gender}
                disabled={role === "patient"}
                onChange={(e) => updatePatient("gender", e.target.value)}
              >
                <option value="">Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>

              <input
                placeholder="Condition"
                value={activePatient.condition}
                disabled={role === "patient"}
                onChange={(e) => updatePatient("condition", e.target.value)}
              />

              <textarea
                placeholder="Notes"
                value={activePatient.notes}
                disabled={role === "patient"}
                onChange={(e) => updatePatient("notes", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {showAnalysisModal && selected && (
        <div className="modal-bg">
          <div className="modal analysis-modal">
            <div className="modal-header">
              <h2>{selected.title}</h2>

              <div className="modal-actions">
                <button onClick={saveGraph}>Save Graph</button>
                <button onClick={() => setShowAnalysisModal(false)}>Close</button>
              </div>
            </div>

            <div className="analysis-summary">
              <div>
                <span>Latest</span>
                <b>
                  {selected.value} {selected.unit}
                </b>
              </div>

              <div>
                <span>Average</span>
                <b>
                  {avg(selected.values)} {selected.unit}
                </b>
              </div>

              <div>
                <span>Minimum</span>
                <b>
                  {minVal(selected.values)} {selected.unit}
                </b>
              </div>

              <div>
                <span>Maximum</span>
                <b>
                  {maxVal(selected.values)} {selected.unit}
                </b>
              </div>
            </div>

            <div className="analysis-chart">
              <Line
                ref={chartRef}
                data={chartData(
                  selected.label,
                  selected.values,
                  selected.color,
                  selectedVital !== "ecg"
                )}
                options={chartOptions(selected.min, selected.max, selected.unit)}
              />
            </div>

            <div className="analysis-text">
              <h3>
                Status:{" "}
                <span className={`status-${statusClass(selected.status)}`}>
                  {selected.status}
                </span>
              </h3>

              <p>
                {selectedVital === "ecg"
                  ? "This ECG wave is drawn from real-time ESP32 AD8232 samples through Supabase."
                  : "This graph is generated from the latest live monitoring data."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;