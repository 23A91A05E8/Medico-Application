
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data");

const FILES = {
  users: path.join(DATA, "users.json"),
  appointments: path.join(DATA, "appointments.json"),
  records: path.join(DATA, "records.json"),
  messages: path.join(DATA, "messages.json")
};

if (!fs.existsSync(DATA)) {
  fs.mkdirSync(DATA, { recursive: true });
}

for (const file of Object.values(FILES)) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
}

function read(key) {
  try {
    return JSON.parse(fs.readFileSync(FILES[key], "utf8"));
  } catch {
    return [];
  }
}

function write(key, value) {
  fs.writeFileSync(FILES[key], JSON.stringify(value, null, 2));
}

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;

  // Compatibility with older accounts that stored city instead of place.
  if (!safe.place && safe.city) safe.place = safe.city;

  return safe;
}

function auth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in first." });
  }
  next();
}

function role(required) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in first." });
    }
    if (req.session.user.role !== required) {
      return res.status(403).json({ error: "Access denied." });
    }
    next();
  };
}

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date));
}

// Demo admin account is created automatically.
function seedAdmin() {
  const users = read("users");
  if (users.some(u => u.role === "admin")) return;

  users.push({
    id: "admin_medico",
    role: "admin",
    name: "MEDICO Admin",
    email: "admin@medico.demo",
    passwordHash: bcrypt.hashSync("MedicoAdmin123!", 10),
    createdAt: new Date().toISOString()
  });

  write("users", users);
}
seedAdmin();

app.use(helmet({ contentSecurityPolicy: false }));

app.use((req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("Content-Security-Policy-Report-Only");
  next();
});

app.use(express.json({ limit: "100kb" }));

app.use(session({
  name: "medico.sid",
  secret: process.env.SESSION_SECRET || "LOCAL-DEMO-ONLY-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    maxAge: 4 * 60 * 60 * 1000
  }
}));

app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, "public")));

// ---------------- AUTH ----------------

app.post("/api/auth/register/:role", async (req, res) => {
  try {
    const accountRole = req.params.role;

    if (!["patient", "doctor"].includes(accountRole)) {
      return res.status(400).json({ error: "Invalid account type." });
    }

    const name = clean(req.body.name, 80);
    const email = clean(req.body.email, 160).toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2) {
      return res.status(400).json({ error: "Enter your full name." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email." });
    }

    if (
      password.length < 10 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return res.status(400).json({
        error: "Password must contain 10 characters, letters and numbers."
      });
    }

    const users = read("users");

    if (users.some(u => u.email === email && u.role === accountRole)) {
      return res.status(409).json({
        error: "This account already exists. Please log in."
      });
    }

    const user = {
      id: accountRole + "_" + Date.now(),
      role: accountRole,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString()
    };

    if (accountRole === "patient") {
      user.phone = clean(req.body.phone, 25);
      user.age = clean(req.body.age, 3);
      user.gender = clean(req.body.gender, 30);
      user.place = clean(req.body.place, 80);
      user.state = clean(req.body.state, 80);
    }

    if (accountRole === "doctor") {
      const online = Boolean(req.body.online);
      const home = Boolean(req.body.home);

      if (!online && !home) {
        return res.status(400).json({
          error: "Select at least one service."
        });
      }

      user.specialty = clean(req.body.specialty, 80);
      user.qualification = clean(req.body.qualification, 100);
      user.registrationNumber = clean(req.body.registrationNumber, 80);
      user.hospitalName = clean(req.body.hospitalName, 120);
      user.place = clean(req.body.place || req.body.city, 80);
      user.state = clean(req.body.state, 80);

      // Keep city for compatibility with older app versions.
      user.city = user.place;

      user.homeVisitArea = clean(req.body.homeVisitArea, 120);
      user.homeVisitPlaces = clean(req.body.homeVisitPlaces, 250);

      user.services = { online, home };

      user.verificationStatus = "pending";
      user.verificationRequest = null;
    }

    users.push(user);
    write("users", users);

    req.session.user = publicUser(user);
    res.status(201).json({ user: publicUser(user) });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/auth/login/:role", async (req, res) => {
  try {
    const accountRole = req.params.role;

    if (!["patient", "doctor", "admin"].includes(accountRole)) {
      return res.status(400).json({ error: "Invalid account type." });
    }

    const email = clean(req.body.email, 160).toLowerCase();
    const password = String(req.body.password || "");
    const user = read("users").find(
      u => u.email === email && u.role === accountRole
    );

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        error: "Email or password is incorrect."
      });
    }

    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({ error: "Could not create session." });
      }

      req.session.user = publicUser(user);
      res.json({ user: publicUser(user) });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed." });
  }
});

// ---------------- FORGOT PASSWORD ----------------

app.post("/api/auth/forgot-password/:role", async (req, res) => {
  try {
    const accountRole = req.params.role;

    // Password reset is available only for patient and doctor accounts.
    if (!["patient", "doctor"].includes(accountRole)) {
      return res.status(400).json({
        error: "Invalid account type."
      });
    }

    const email = clean(req.body.email, 160).toLowerCase();
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Enter a valid registered email."
      });
    }

    if (
      newPassword.length < 10 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword)
    ) {
      return res.status(400).json({
        error: "Password must contain 10 characters, letters and numbers."
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: "New password and confirm password do not match."
      });
    }

    const users = read("users");

    const user = users.find(
      u => u.email === email && u.role === accountRole
    );

    if (!user) {
      return res.status(404).json({
        error: "No account found with this email."
      });
    }

    // Hash the new password before saving.
    user.passwordHash = await bcrypt.hash(newPassword, 12);

    write("users", users);

    res.json({
      message: "Password updated successfully. Please log in."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not update password. Please try again."
    });
  }
});

app.post("/api/auth/logout", auth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("medico.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", auth, (req, res) => {
  const latest = read("users").find(u => u.id === req.session.user.id);
  if (latest) req.session.user = publicUser(latest);
  res.json({ user: req.session.user });
});

// ---------------- PROFILE ----------------

app.patch("/api/profile", auth, (req, res) => {
  const users = read("users");
  const user = users.find(u => u.id === req.session.user.id);

  if (!user) {
    return res.status(404).json({ error: "Profile not found." });
  }

  user.name = clean(req.body.name, 80) || user.name;
  user.phone = clean(req.body.phone, 25);

  if (user.role === "patient") {
    user.place = clean(req.body.place, 80);
    user.state = clean(req.body.state, 80);
  }

  if (user.role === "doctor") {
    const online = Boolean(req.body.online);
    const home = Boolean(req.body.home);

    if (!online && !home) {
      return res.status(400).json({
        error: "Select at least one service."
      });
    }

    user.specialty = clean(req.body.specialty, 80);
    user.qualification = clean(req.body.qualification, 100);
    user.hospitalName = clean(req.body.hospitalName, 120);
    user.place = clean(req.body.place || req.body.city, 80);
    user.state = clean(req.body.state, 80);

    // Keep old city property synchronized for compatibility.
    user.city = user.place;

    user.homeVisitArea = clean(req.body.homeVisitArea, 120);
    user.homeVisitPlaces = clean(req.body.homeVisitPlaces, 250);
    user.services = { online, home };
  }

  write("users", users);
  req.session.user = publicUser(user);
  res.json({ user: publicUser(user) });
});

// ---------------- DOCTOR VERIFICATION ----------------

app.post("/api/verification", auth, role("doctor"), (req, res) => {
  const users = read("users");
  const doctor = users.find(u => u.id === req.session.user.id);

  if (!doctor) {
    return res.status(404).json({ error: "Doctor account not found." });
  }

  if (doctor.verificationStatus === "verified") {
    return res.status(400).json({ error: "Your account is already approved." });
  }

  const documentType = clean(req.body.documentType, 100);
  const documentNumber = clean(req.body.documentNumber, 100);
  const documentDetails = clean(req.body.documentDetails, 1000);

  if (!documentType || !documentNumber || !documentDetails) {
    return res.status(400).json({
      error: "Please complete all verification document details."
    });
  }

  doctor.verificationRequest = {
    documentType,
    documentNumber,
    documentDetails,
    submittedAt: new Date().toISOString()
  };

  doctor.verificationStatus = "pending";
  doctor.verificationNote = "";

  write("users", users);
  req.session.user = publicUser(doctor);

  res.json({
    user: publicUser(doctor),
    message: "Verification request submitted for admin review."
  });
});

// ---------------- ADMIN VERIFICATION ----------------

app.get("/api/admin/verification", auth, role("admin"), (req, res) => {
  const doctors = read("users")
    .filter(u => u.role === "doctor")
    .map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      specialty: u.specialty,
      qualification: u.qualification,
      registrationNumber: u.registrationNumber,
      hospitalName: u.hospitalName,
      place: u.place || u.city || "",
      city: u.city || u.place || "",
      state: u.state || "",
      verificationStatus: u.verificationStatus || "pending",
      verificationRequest: u.verificationRequest || null,
      verificationNote: u.verificationNote || ""
    }));

  res.json({ doctors });
});

app.patch(
  "/api/admin/doctors/:id/verification",
  auth,
  role("admin"),
  (req, res) => {
    const status = req.body.status;
    const note = clean(req.body.note, 500);

    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Choose approve or reject." });
    }

    const users = read("users");
    const doctor = users.find(
      u => u.id === req.params.id && u.role === "doctor"
    );

    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found." });
    }

    if (!doctor.verificationRequest) {
      return res.status(400).json({
        error: "Doctor has not submitted verification details."
      });
    }

    doctor.verificationStatus = status;
    doctor.verificationNote = note;
    doctor.reviewedAt = new Date().toISOString();

    write("users", users);
    res.json({ doctor: publicUser(doctor) });
  }
);

// ---------------- VERIFIED DOCTORS ----------------

app.get("/api/doctors", auth, role("patient"), (req, res) => {
  const doctors = read("users")
    .filter(u =>
      u.role === "doctor" &&
      u.verificationStatus === "verified"
    )
    .map(u => ({
      id: u.id,
      name: u.name,
      specialty: u.specialty,
      qualification: u.qualification,
      hospitalName: u.hospitalName,
      place: u.place || u.city || "",
      city: u.city || u.place || "",
      state: u.state || "",
      services: u.services || { online: true, home: false },
      homeVisitArea: u.homeVisitArea,
      homeVisitPlaces: u.homeVisitPlaces
    }));

  res.json({ doctors });
});

// ---------------- APPOINTMENTS ----------------

app.post("/api/appointments", auth, role("patient"), (req, res) => {
  const doctor = read("users").find(u =>
    u.id === clean(req.body.doctorId, 120) &&
    u.role === "doctor" &&
    u.verificationStatus === "verified"
  );

  if (!doctor) {
    return res.status(400).json({
      error: "This doctor is not verified for booking."
    });
  }

  const type = req.body.type;
  const date = clean(req.body.date, 10);
  const time = clean(req.body.time, 20);

  if (!validDate(date) || date < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: "Choose a valid appointment date." });
  }

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: "Choose a valid appointment time." });
  }

  if (!["online", "home"].includes(type)) {
    return res.status(400).json({ error: "Choose an appointment type." });
  }

  const services = doctor.services || { online: true, home: false };

  if (type === "online" && !services.online) {
    return res.status(400).json({
      error: "This doctor does not offer online consultation."
    });
  }

  if (type === "home" && !services.home) {
    return res.status(400).json({
      error: "This doctor does not offer home visits."
    });
  }

  let address = "";
  let addressDetails = null;

  if (type === "home") {
    const input = req.body.addressDetails || {};

    addressDetails = {
      house: clean(input.house, 120),
      area: clean(input.area, 120),
      place: clean(input.place, 80),
      state: clean(input.state, 80),
      pincode: clean(input.pincode, 10),
      landmark: clean(input.landmark, 120)
    };

    if (
      !addressDetails.house ||
      !addressDetails.area ||
      !addressDetails.place ||
      !addressDetails.state ||
      !addressDetails.pincode
    ) {
      return res.status(400).json({
        error: "Enter House / Street, Area, Place, State and PIN Code."
      });
    }

    if (!/^[0-9]{4,10}$/.test(addressDetails.pincode)) {
      return res.status(400).json({
        error: "Enter a valid PIN Code."
      });
    }

    address = [
      addressDetails.house,
      addressDetails.area,
      addressDetails.place,
      addressDetails.state,
      "PIN: " + addressDetails.pincode,
      addressDetails.landmark ? "Landmark: " + addressDetails.landmark : ""
    ].filter(Boolean).join(", ");
  }

  const appointments = read("appointments");

  const appointment = {
    id: "apt_" + Date.now(),
    patientId: req.session.user.id,
    patientName: req.session.user.name,
    doctorId: doctor.id,
    doctorName: doctor.name,
    type,
    date,
    time,
    patientAddress: address,
    addressDetails,
    reason: clean(req.body.reason, 500),
    status: "Pending",
    createdAt: new Date().toISOString()
  };

  appointments.push(appointment);
  write("appointments", appointments);

  res.status(201).json({ appointment });
});

app.get("/api/appointments", auth, (req, res) => {
  const user = req.session.user;

  const appointments = read("appointments")
    .filter(a =>
      user.role === "patient"
        ? a.patientId === user.id
        : user.role === "doctor"
          ? a.doctorId === user.id
          : false
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ appointments });
});

app.patch("/api/appointments/:id", auth, role("doctor"), (req, res) => {
  const status = req.body.status;

  if (!["Confirmed", "Declined", "Completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid appointment status." });
  }

  const appointments = read("appointments");
  const appointment = appointments.find(a =>
    a.id === req.params.id &&
    a.doctorId === req.session.user.id
  );

  if (!appointment) {
    return res.status(404).json({ error: "Appointment not found." });
  }

  appointment.status = status;
  write("appointments", appointments);

  res.json({ appointment });
});

// ---------------- PRESCRIPTIONS / REPORTS ----------------

app.post("/api/records", auth, role("doctor"), (req, res) => {
  const appointment = read("appointments").find(a =>
    a.id === clean(req.body.appointmentId, 140) &&
    a.doctorId === req.session.user.id
  );

  if (!appointment) {
    return res.status(404).json({ error: "Appointment not found." });
  }

  const kind = req.body.kind;
  const title = clean(req.body.title, 120);
  const body = clean(req.body.body, 5000);

  if (!["prescription", "report"].includes(kind) || !title || !body) {
    return res.status(400).json({ error: "Enter valid record details." });
  }

  const records = read("records");
  const record = {
    id: "rec_" + Date.now(),
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    doctorName: appointment.doctorName,
    patientName: appointment.patientName,
    kind,
    title,
    body,
    createdAt: new Date().toISOString()
  };

  records.push(record);
  write("records", records);
  res.status(201).json({ record });
});

app.get("/api/records", auth, (req, res) => {
  const user = req.session.user;

  const records = read("records")
    .filter(r =>
      user.role === "patient"
        ? r.patientId === user.id
        : user.role === "doctor"
          ? r.doctorId === user.id
          : false
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ records });
});

// ---------------- PATIENT / DOCTOR MESSAGES ----------------

function getChatParticipants(user, otherId) {
  const other = read("users").find(u => u.id === otherId);
  if (!other) return null;

  let patientId, doctorId;

  if (user.role === "patient" && other.role === "doctor") {
    patientId = user.id;
    doctorId = other.id;
  } else if (user.role === "doctor" && other.role === "patient") {
    patientId = other.id;
    doctorId = user.id;
  } else {
    return null;
  }

  const doctor = read("users").find(u => u.id === doctorId);
  if (!doctor || doctor.verificationStatus !== "verified") return null;

  return { patientId, doctorId };
}

app.get("/api/messages/:otherId", auth, (req, res) => {
  if (!["patient", "doctor"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Messaging is not available." });
  }

  const pair = getChatParticipants(req.session.user, req.params.otherId);
  if (!pair) {
    return res.status(400).json({ error: "Invalid chat participants." });
  }

  const messages = read("messages")
    .filter(m =>
      m.patientId === pair.patientId &&
      m.doctorId === pair.doctorId
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  res.json({ messages });
});

app.post("/api/messages/:otherId", auth, (req, res) => {
  if (!["patient", "doctor"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Messaging is not available." });
  }

  const pair = getChatParticipants(req.session.user, req.params.otherId);
  if (!pair) {
    return res.status(400).json({ error: "Invalid chat participants." });
  }

  const messageText = clean(req.body.message, 2000);
  if (!messageText) {
    return res.status(400).json({ error: "Type a message first." });
  }

  const messages = read("messages");
  const message = {
    id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    ...pair,
    senderId: req.session.user.id,
    senderRole: req.session.user.role,
    senderName: req.session.user.name,
    message: messageText,
    createdAt: new Date().toISOString()
  };

  messages.push(message);
  write("messages", messages);

  res.status(201).json({ message });
});

// ---------------- MEDICINES ----------------

app.get("/api/medicines", auth, role("patient"), (req, res) => {
  res.json({
    medicines: [
      { id: "m1", name: "Digital Thermometer", category: "Health device", price: 199 },
      { id: "m2", name: "First Aid Kit", category: "First aid", price: 349 },
      { id: "m3", name: "Reusable Hot Water Bag", category: "Wellness", price: 249 },
      { id: "m4", name: "Hand Sanitizer", category: "Personal care", price: 99 }
    ]
  });
});

// ---------------- WEBSITE ----------------

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("--------------------------------");
  console.log("MEDICO server started successfully");
  console.log("Open: http://localhost:" + PORT);
  console.log("--------------------------------");
});
