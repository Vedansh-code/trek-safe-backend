const express = require("express");
const dotenv = require("dotenv");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

dotenv.config();
const app = express();

app.use(cors()); 
app.use(express.json());

// Connect to SQLite database (creates file if not exists)
const db = new sqlite3.Database("treksafe.db", (err) => {
  if (err) console.error("❌ DB connection error:", err.message);
  else console.log("✅ Connected to SQLite database");
});

// ====================== TABLES ======================
// Tourists
db.run(`
  CREATE TABLE IF NOT EXISTS tourists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    idProof TEXT NOT NULL,
    emergencyContact TEXT NOT NULL,
    itinerary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Locations
db.run(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    touristId TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (touristId) REFERENCES tourists(id)
  )
`);

// SOS Alerts
db.run(`
  CREATE TABLE IF NOT EXISTS sos_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    touristId TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (touristId) REFERENCES tourists(id)
  )
`);

// ====================== ROUTES ======================

// Test route
app.get("/", (req, res) => {
  res.send("🚀 Trek-Safe Backend (server.js + SQLite3) is running!");
});

// ---------- Tourist Registration ----------
app.post("/tourists", (req, res) => {
  const { name, age, idProof, emergencyContact, itinerary } = req.body;
  const id = "TRS-" + Math.random().toString(36).substr(2, 9).toUpperCase();

  db.run(
    "INSERT INTO tourists (id, name, age, idProof, emergencyContact, itinerary) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, age, idProof, emergencyContact, itinerary],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, name, age, idProof, emergencyContact, itinerary });
    }
  );
});

// ---------- Get all tourists ----------
app.get("/tourists", (req, res) => {
  db.all("SELECT * FROM tourists ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ---------- Get single tourist ----------
app.get("/tourists/:id", (req, res) => {
  const touristId = req.params.id;
  db.get("SELECT * FROM tourists WHERE id = ?", [touristId], (err, tourist) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tourist) return res.status(404).json({ error: "Tourist not found" });

    // Get all locations
    db.all("SELECT * FROM locations WHERE touristId = ? ORDER BY timestamp DESC", [touristId], (err, locations) => {
      if (err) return res.status(500).json({ error: err.message });

      // Get all SOS alerts
      db.all("SELECT * FROM sos_alerts WHERE touristId = ? ORDER BY timestamp DESC", [touristId], (err, sosAlerts) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
          ...tourist,
          locations,
          sosAlerts
        });
      });
    });
  });
});

// ---------- Update location ----------
app.post("/tourists/:id/location", (req, res) => {
  const { lat, lng } = req.body;
  db.run(
    "INSERT INTO locations (touristId, lat, lng) VALUES (?, ?, ?)",
    [req.params.id, lat, lng],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ touristId: req.params.id, lat, lng, timestamp: new Date() });
    }
  );
});

// ---------- SOS Alert ----------
app.post("/tourists/:id/sos", (req, res) => {
  const { lat, lng } = req.body;
  db.run(
    "INSERT INTO sos_alerts (touristId, lat, lng) VALUES (?, ?, ?)",
    [req.params.id, lat, lng],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "🚨 SOS Alert Recorded", touristId: req.params.id, lat, lng });
    }
  );
});

// ---------- Police: get all tourists with latest location and SOS ----------
app.get("/police/tourists", (req, res) => {
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
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ====================== SERVER LISTEN ======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`⚡ Server running on port ${PORT}`);
});
