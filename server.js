const express = require("express");
const dotenv = require("dotenv");
const Database = require("better-sqlite3");
const cors = require("cors");
const fetch = require("node-fetch");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// ====================== DATABASE ======================
const db = new Database("treksafe.db");
console.log("✅ Connected to SQLite database");

// Tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS tourists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    idProof TEXT NOT NULL,
    emergencyContact TEXT NOT NULL,
    itinerary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    touristId TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (touristId) REFERENCES tourists(id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS sos_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    touristId TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (touristId) REFERENCES tourists(id)
  )
`).run();

// ====================== ROUTES ======================

// Test route
app.get("/", (req, res) => {
  res.send("🚀 Trek-Safe Backend (server.js + better-sqlite3) is running!");
});

// ---------- Tourist Registration ----------
app.post("/tourists", (req, res) => {
  try {
    const { name, age, idProof, emergencyContact, itinerary } = req.body;
    const id = "TRS-" + Math.random().toString(36).substr(2, 9).toUpperCase();

    db.prepare(`
      INSERT INTO tourists (id, name, age, idProof, emergencyContact, itinerary)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, age, idProof, emergencyContact, itinerary);

    res.json({ id, name, age, idProof, emergencyContact, itinerary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Get all tourists ----------
app.get("/tourists", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM tourists ORDER BY created_at DESC").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Get single tourist with locations + SOS ----------
app.get("/tourists/:id", (req, res) => {
  try {
    const touristId = req.params.id;
    const tourist = db.prepare("SELECT * FROM tourists WHERE id = ?").get(touristId);

    if (!tourist) return res.status(404).json({ error: "Tourist not found" });

    const locations = db.prepare("SELECT * FROM locations WHERE touristId = ? ORDER BY timestamp DESC").all(touristId);
    const sosAlerts = db.prepare("SELECT * FROM sos_alerts WHERE touristId = ? ORDER BY timestamp DESC").all(touristId);

    res.json({ ...tourist, locations, sosAlerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Update location ----------
app.post("/tourists/:id/location", (req, res) => {
  try {
    const { lat, lng } = req.body;
    db.prepare("INSERT INTO locations (touristId, lat, lng) VALUES (?, ?, ?)").run(req.params.id, lat, lng);

    res.json({ touristId: req.params.id, lat, lng, timestamp: new Date() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- SOS Alert ----------
app.post("/tourists/:id/sos", (req, res) => {
  try {
    const { lat, lng } = req.body;
    db.prepare("INSERT INTO sos_alerts (touristId, lat, lng) VALUES (?, ?, ?)").run(req.params.id, lat, lng);

    res.json({ message: "🚨 SOS Alert Recorded", touristId: req.params.id, lat, lng });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Get all SOS alerts ----------
app.get("/sos_alerts", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM sos_alerts ORDER BY timestamp DESC").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Police: get all tourists with latest location + SOS ----------
app.get("/police/tourists", (req, res) => {
  try {
    const query = `
      SELECT t.id, t.name, t.age, t.idProof, t.emergencyContact, t.itinerary,
        l.lat AS currentLat, l.lng AS currentLng,
        s.timestamp AS lastSOS
      FROM tourists t
      LEFT JOIN locations l ON l.id = (
        SELECT id FROM locations WHERE touristId = t.id ORDER BY timestamp DESC LIMIT 1
      )
      LEFT JOIN sos_alerts s ON s.id = (
        SELECT id FROM sos_alerts WHERE touristId = t.id ORDER BY timestamp DESC LIMIT 1
      )
      ORDER BY t.created_at DESC
    `;
    const rows = db.prepare(query).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Chatbot (AI Safety Assistant) ----------
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // good balance of cost/speed
        messages: [
          { role: "system", content: "You are TrekSafeBot, a safety assistant for trekkers. Give clear, short, and helpful answers." },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();

    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ error: "Chatbot request failed" });
  }
});

// ====================== SERVER LISTEN ======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`⚡ Server running on port ${PORT}`);
});
