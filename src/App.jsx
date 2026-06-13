import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
} from "chart.js";

import { Line } from "react-chartjs-2";
import "./App.css";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip
);

const supabase = createClient(
  "https://eyqlnokjumljeejibqrf.supabase.co",
  "sb_publishable_4xM5tJcI0iQP1LRgBkt57A_m8gvDmIE"
);

function App() {
  const [data, setData] = useState(null);
  const [running, setRunning] = useState(true);

  const [hrHistory, setHrHistory] = useState([]);
  const [spo2History, setSpo2History] = useState([]);
  const [smokeHistory, setSmokeHistory] = useState([]);

  async function fetchData() {
    if (!running) return;

    const { data, error } = await supabase
      .from("patient_data")
      .select("*")
      .order("id", { ascending: false })
      .limit(1);

    if (!error && data.length > 0) {
      const latest = data[0];

      setData(latest);

      setHrHistory((prev) => [
        ...prev.slice(-19),
        latest.heart_rate,
      ]);

      setSpo2History((prev) => [
        ...prev.slice(-19),
        latest.spo2,
      ]);

      setSmokeHistory((prev) => [
        ...prev.slice(-19),
        latest.smoke,
      ]);
    }
  }

  useEffect(() => {
    fetchData();

    const timer = setInterval(fetchData, 2000);

    return () => clearInterval(timer);
  }, [running]);

  const hrAlarm =
    data &&
    (data.heart_rate > 120 || data.heart_rate < 50);

  const spo2Alarm =
    data &&
    data.spo2 < 90;

  const smokeAlarm =
    data &&
    data.smoke > 300;

  const chartData = {
    labels: hrHistory.map((_, i) => i + 1),

    datasets: [
      {
        label: "Heart Rate",
        data: hrHistory,
        borderColor: "#ff4d4d",
        tension: 0.4,
      },

      {
        label: "SpO₂",
        data: spo2History,
        borderColor: "#00ff88",
        tension: 0.4,
      },

      {
        label: "Smoke",
        data: smokeHistory,
        borderColor: "#ff9900",
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="container">

      <div className="header">
        <div>
          <h1>MAX30102 & Smoke Sensor IoT Dashboard</h1>
          <p>
            ESP32 → MQTT → Node-RED → Supabase → React
          </p>
        </div>

        <div className="live">
          ● LIVE
        </div>
      </div>

      <div className="cards">

        <div className="card red">
          <h2>❤️ Heart Rate</h2>
          <h1>{data?.heart_rate ?? "--"}</h1>
          <p>BPM</p>
        </div>

        <div className="card green">
          <h2>🫁 SpO₂</h2>
          <h1>{data?.spo2 ?? "--"}</h1>
          <p>%</p>
        </div>

        <div className="card orange">
          <h2>💨 Smoke</h2>
          <h1>{data?.smoke ?? "--"}</h1>
          <p>ppm</p>
        </div>

      </div>

      <div className="graph">

        <h2>Real-Time Sensor Graph</h2>

        <Line data={chartData} />

      </div>

      <div className="buttons">

        <button onClick={fetchData}>
          Refresh Data
        </button>

        <button
          onClick={() =>
            window.open(
              "http://localhost:1880/ui",
              "_blank"
            )
          }
        >
          Open Node-RED
        </button>

        <button
          className="stop"
          onClick={() =>
            setRunning(!running)
          }
        >
          {running
            ? "Stop Monitoring"
            : "Start Monitoring"}
        </button>

      </div>

      <div className="alarm-panel">

        <h2>Alarm Panel</h2>

        {!hrAlarm &&
          !spo2Alarm &&
          !smokeAlarm && (
            <p className="safe">
              ✅ All Parameters Normal
            </p>
          )}

        {hrAlarm && (
          <p className="danger">
            ⚠ Heart Rate Abnormal
          </p>
        )}

        {spo2Alarm && (
          <p className="danger">
            ⚠ Low SpO₂ Detected
          </p>
        )}

        {smokeAlarm && (
          <p className="danger">
            ⚠ Smoke Level High
          </p>
        )}

      </div>

      <div className="status">

        <div className="row">
          <span>Database</span>
          <b>Connected</b>
        </div>

        <div className="row">
          <span>Last Update</span>

          <b>
            {data?.created_at
              ? new Date(
                  data.created_at
                ).toLocaleString()
              : "Waiting"}
          </b>
        </div>

      </div>

    </div>
  );
}

export default App;