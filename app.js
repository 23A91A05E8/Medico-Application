
let role = "patient", mode = "login", me = null, currentPage = "dashboard";
let doctorCache = [];
let activeChatId = null;
let activeChatName = "";

const $ = id => document.getElementById(id);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

async function api(url, opt = {}) {
  const r = await fetch(url, {
    ...opt,
    headers: { "Content-Type": "application/json", ...(opt.headers || {}) },
    credentials: "same-origin"
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}

function openAuth(r) {
  role = r;
  mode = "login";
  $("landing").classList.add("hidden");
  $("auth").classList.remove("hidden");
  $("workspace").classList.add("hidden");
  $("authTabs").classList.toggle("hidden", r === "admin");
  setMode("login");
}

function backHome() {
  $("landing").classList.remove("hidden");
  $("auth").classList.add("hidden");
  $("forgotPasswordPanel").classList.add("hidden");
}

function setMode(m) {
  if (role === "admin" && m === "register") return;

  mode = m;

  // Reset Forgot Password screen when switching login/register
  $("forgotPasswordPanel").classList.add("hidden");
  $("authForm").classList.remove("hidden");
  $("authTabs").classList.toggle("hidden", role === "admin");
  $("forgotLinkWrap").classList.toggle("hidden", m !== "login" || role === "admin");

  $("tabLogin").classList.toggle("active", m === "login");
  $("tabRegister").classList.toggle("active", m === "register");
  $("nameField").classList.toggle("hidden", m !== "register");
  $("patientExtra").classList.toggle("hidden", m !== "register" || role !== "patient");
  $("doctorExtra").classList.toggle("hidden", m !== "register" || role !== "doctor");

  $("authTitle").textContent =
    (role === "admin" ? "Admin" : role === "patient" ? "Patient" : "Doctor") +
    " " + (m === "login" ? "Login" : "Registration");

  $("authDesc").textContent = role === "admin"
    ? "Sign in to review doctor verification requests."
    : m === "login"
      ? "Sign in to your separate " + role + " account."
      : "Create your " + role + " account to continue.";

  $("authSubmit").textContent = m === "login" ? "Login securely" : "Create account";
  $("authError").textContent = "";
  $("password").value = "";
}

// ---------------- FORGOT PASSWORD ----------------

function showForgotPassword() {
  $("authTabs").classList.add("hidden");
  $("authForm").classList.add("hidden");
  $("forgotLinkWrap").classList.add("hidden");
  $("forgotPasswordPanel").classList.remove("hidden");

  $("authTitle").textContent = "Forgot Password";
  $("authDesc").textContent = "Reset your " + role + " account password.";

  $("forgotEmail").value = $("email").value.trim();
  $("newPassword").value = "";
  $("confirmNewPassword").value = "";
  $("forgotError").textContent = "";
  $("forgotSubmit").disabled = false;
}

function backToLogin() {
  $("forgotPasswordPanel").classList.add("hidden");
  $("authForm").classList.remove("hidden");
  $("authTabs").classList.toggle("hidden", role === "admin");

  setMode("login");
}

$("forgotPasswordForm").addEventListener("submit", async e => {
  e.preventDefault();

  const email = $("forgotEmail").value.trim();
  const newPassword = $("newPassword").value;
  const confirmPassword = $("confirmNewPassword").value;

  $("forgotError").textContent = "";

  if (newPassword !== confirmPassword) {
    $("forgotError").textContent = "New password and confirm password do not match.";
    return;
  }

  if (!/^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(newPassword)) {
    $("forgotError").textContent =
      "Password must be at least 10 characters and include letters and numbers.";
    return;
  }

  $("forgotSubmit").disabled = true;

  try {
    await api(`/api/auth/forgot-password/${role}`, {
      method: "POST",
      body: JSON.stringify({
        email,
        newPassword,
        confirmPassword
      })
    });

    $("email").value = email;

    toast("Password updated successfully. Please log in.");
    backToLogin();

  } catch (err) {
    $("forgotError").textContent = err.message;
  } finally {
    $("forgotSubmit").disabled = false;
  }
});

// ---------------- LOGIN / REGISTRATION ----------------

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("authSubmit").disabled = true;
  $("authError").textContent = "";

  try {
    const b = {
      email: $("email").value.trim(),
      password: $("password").value
    };

    if (mode === "register") {
      b.name = $("name").value.trim();

      if (role === "patient") {
        Object.assign(b, {
          phone: $("phone").value,
          age: $("age").value,
          gender: $("gender").value,
          place: $("patientPlace").value,
          state: $("patientState").value
        });
      } else {
        const online = $("serviceOnline").checked;
        const home = $("serviceHome").checked;

        if (!online && !home) {
          throw Error("Select at least one service.");
        }

        Object.assign(b, {
          specialty: $("specialty").value,
          qualification: $("qualification").value,
          registrationNumber: $("registrationNumber").value,
          hospitalName: $("hospitalName").value,
          place: $("doctorPlace").value,
          state: $("doctorState").value,
          homeVisitArea: $("homeVisitArea").value,
          homeVisitPlaces: $("homeVisitPlaces").value,
          online,
          home
        });
      }
    }

    const d = await api(`/api/auth/${mode}/${role}`, {
      method: "POST",
      body: JSON.stringify(b)
    });

    me = d.user;
    await enter();
    toast(mode === "register" ? "Account created successfully." : "Welcome back.");

  } catch (err) {
    $("authError").textContent = err.message;
  } finally {
    $("authSubmit").disabled = false;
  }
});

async function enter() {
  $("landing").classList.add("hidden");
  $("auth").classList.add("hidden");
  $("workspace").classList.remove("hidden");

  $("sideName").textContent = me.name;
  $("sideRole").textContent =
    me.role === "admin" ? "Administrator" :
    me.role === "doctor" ? "Doctor account" : "Patient account";

  $("avatar").textContent = (me.name || "M")[0].toUpperCase();

  buildNav();
  await go("dashboard");
}

function buildNav() {
  let items;

  if (me.role === "patient") {
    items = [
      ["dashboard", "⌂", "Overview"],
      ["profile", "♙", "My Profile"],
      ["appointments", "▣", "Appointments"],
      ["doctors", "⚕", "Find Doctors"],
      ["records", "▤", "Prescriptions & Reports"],
      ["medicines", "＋", "Medicines"],
      ["messages", "✉", "Messages"]
    ];
  } else if (me.role === "doctor") {
    items = [
      ["dashboard", "⌂", "Overview"],
      ["profile", "♙", "My Profile"],
      ["appointments", "▣", "Appointments"],
      ["records", "▤", "Sent Records"],
      ["messages", "✉", "Messages"]
    ];
  } else {
    items = [
      ["dashboard", "⌂", "Overview"],
      ["verification", "✓", "Doctor Verification"]
    ];
  }

  $("nav").innerHTML = items.map(([id, ic, name]) =>
    `<button class="navitem ${currentPage === id ? "active" : ""}" onclick="go('${id}')">
      <span>${ic}</span>${name}
    </button>`
  ).join("");
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {}

  me = null;
  activeChatId = null;
  $("workspace").classList.add("hidden");
  $("landing").classList.remove("hidden");
}

async function check() {
  try {
    const d = await api("/api/me");
    me = d.user;
    await enter();
  } catch {}
}

async function go(p) {
  currentPage = p;
  buildNav();

  const titles = {
    dashboard: "Overview",
    profile: "My Profile",
    appointments: "Appointments",
    doctors: "Find a Doctor",
    records: me.role === "patient" ? "Prescriptions & Reports" : "Sent Records",
    medicines: "Medicines",
    messages: "Messages",
    verification: "Doctor Verification"
  };

  $("pageTitle").textContent = titles[p] || "MEDICO";
  $("pageSub").textContent =
    `Hello ${me.name.split(" ")[0]}, welcome to your MEDICO workspace.`;

  $("view").innerHTML = '<div class="panel">Loading…</div>';

  try {
    const pages = {
      dashboard, profile, appointments, doctors, records,
      medicines, messages, verification
    };
    $("view").innerHTML = await pages[p]();
  } catch (e) {
    $("view").innerHTML = `<div class="panel error">${esc(e.message)}</div>`;
  }
}

// ---------------- DASHBOARD ----------------

async function dashboard() {
  if (me.role === "admin") {
    const { doctors } = await api("/api/admin/verification");
    const pending = doctors.filter(d =>
      d.verificationRequest && d.verificationStatus === "pending"
    ).length;

    return `
      <div class="stats">
        <div class="stat"><div class="ico">🩺</div><strong>${doctors.length}</strong><small>Total doctors</small></div>
        <div class="stat"><div class="ico">⌛</div><strong>${pending}</strong><small>Pending reviews</small></div>
        <div class="stat"><div class="ico">✓</div><strong>${doctors.filter(d => d.verificationStatus === "verified").length}</strong><small>Approved</small></div>
        <div class="stat"><div class="ico">✕</div><strong>${doctors.filter(d => d.verificationStatus === "rejected").length}</strong><small>Rejected</small></div>
      </div>
      <section class="panel">
        <h3>Admin actions</h3>
        <p>Review doctor-submitted verification details and approve or reject requests.</p>
        <button class="btn primary" onclick="go('verification')">Review verification requests</button>
      </section>
      <div class="notice">Demo admin review only. This screen does not verify medical registration with any government authority or medical council.</div>`;
  }

  const { appointments: a } = await api("/api/appointments");
  const { records: r } = await api("/api/records");
  const pending = a.filter(x => x.status === "Pending").length;

  const stats = me.role === "patient"
    ? [
        [a.length, "Appointments", "▣"],
        [a.filter(x => x.status === "Confirmed").length, "Confirmed", "✓"],
        [r.filter(x => x.kind === "prescription").length, "Prescriptions", "℞"],
        [r.filter(x => x.kind === "report").length, "Reports", "▤"]
      ]
    : [
        [a.length, "Total requests", "▣"],
        [pending, "Pending", "⌛"],
        [a.filter(x => x.status === "Confirmed").length, "Confirmed", "✓"],
        [r.length, "Records sent", "▤"]
      ];

  let verification = "";

  if (me.role === "doctor") {
    const status = me.verificationStatus || "pending";
    const statusText = status === "verified" ? "Approved" :
      status === "rejected" ? "Rejected" : "Pending";

    verification = `
      <section class="panel verification-panel">
        <h3>Doctor verification</h3>
        <p>Your current status:
          <span class="pill ${status}">${statusText}</span>
        </p>
        ${
          status === "verified"
            ? '<p>Your profile is approved and can appear in Patient Find Doctors.</p>'
            : status === "rejected"
              ? `<p>Admin note: ${esc(me.verificationNote || "Please review your details and submit again.")}</p>
                 <button class="btn primary" onclick="go('verification')">Submit again</button>`
              : `<p>Submit your registration document details for demo admin review. Your profile stays hidden from patients until approval.</p>
                 <button class="btn primary" onclick="go('verification')">＋ Get Verified</button>`
        }
      </section>`;
  }

  return `
    <div class="stats">
      ${stats.map(s => `
        <div class="stat">
          <div class="ico">${s[2]}</div>
          <strong>${s[0]}</strong>
          <small>${s[1]}</small>
        </div>`).join("")}
    </div>

    ${verification}

    <div class="columns">
      <section class="panel">
        <h3>Recent appointments</h3>
        ${a.length ? a.slice(0, 5).map(aptRow).join("") : '<div class="empty">No appointments yet.</div>'}
      </section>

      <section class="panel">
        <h3>Quick actions</h3>
        ${
          me.role === "patient"
            ? `<button class="btn primary full" onclick="go('doctors')">＋ Find a doctor</button>
               <p><button class="btn soft full" onclick="go('records')">View prescriptions & reports</button></p>
               <button class="btn outline full" onclick="go('messages')">Open messages</button>`
            : `<button class="btn primary full" onclick="go('appointments')">View appointment requests</button>
               <p><button class="btn soft full" onclick="go('records')">View records you sent</button></p>
               <button class="btn outline full" onclick="go('messages')">Open patient messages</button>`
        }
      </section>
    </div>

    <div class="notice">Prototype only: local JSON files are used instead of a database. Do not add real patient health information.</div>`;
}

function aptRow(a) {
  return `
    <div class="row">
      <div class="docicon">${a.type === "home" ? "🏠" : "💻"}</div>
      <div class="grow">
        <strong>${esc(me.role === "patient" ? "Dr. " + a.doctorName : a.patientName)}</strong>
        <small>${esc(a.date)} · ${esc(a.time)} · ${a.type === "home" ? "Home visit" : "Online consultation"}</small>
      </div>
      <span class="pill ${a.status.toLowerCase()}">${esc(a.status)}</span>
    </div>`;
}

// ---------------- PROFILE ----------------

async function profile() {
  const doctorFields = me.role === "doctor" ? `
    <label>Specialization<input id="pspecialty" value="${esc(me.specialty || "")}"></label>
    <label>Qualification<input id="pqualification" value="${esc(me.qualification || "")}"></label>
    <label>Hospital name<input id="phospital" value="${esc(me.hospitalName || "")}"></label>
    <label>Place<input id="pplace" value="${esc(me.place || me.city || "")}" placeholder="Enter place / town"></label>
    <label>State<input id="pstate" value="${esc(me.state || "")}" placeholder="Enter state"></label>
    <label>Home visit area<input id="parea" value="${esc(me.homeVisitArea || "")}"></label>
    <label>Home visit places<textarea id="pplaces" rows="2">${esc(me.homeVisitPlaces || "")}</textarea></label>
    <div class="form-section wide">
      <b>Services offered</b>
      <label class="check-label"><input type="checkbox" id="ponline" ${(me.services ? me.services.online : true) ? "checked" : ""}> Online consultation</label>
      <label class="check-label"><input type="checkbox" id="phome" ${me.services?.home ? "checked" : ""}> Home visit</label>
    </div>
    <div class="wide"><p>Verification status: <b>${esc(me.verificationStatus || "pending")}</b></p></div>` : "";

  const patientFields = me.role === "patient" ? `
    <label>Place<input id="pplace" value="${esc(me.place || me.city || "")}" placeholder="Enter place / town"></label>
    <label>State<input id="pstate" value="${esc(me.state || "")}" placeholder="Enter state"></label>` : "";

  return `
    <section class="panel">
      <h3>Personal profile</h3>
      <form id="profileForm" onsubmit="saveProfile(event)">
        <div class="formgrid">
          <label>Full name<input id="pname" value="${esc(me.name)}" required></label>
          <label>Email address<input value="${esc(me.email)}" disabled></label>
          <label>Account type<input value="${esc(me.role)}" disabled></label>
          <label>Phone number<input id="pphone" value="${esc(me.phone || "")}"></label>
          ${patientFields}
          ${doctorFields}
        </div>
        <button class="btn primary">Save profile</button>
      </form>
    </section>`;
}

async function saveProfile(e) {
  e.preventDefault();

  const b = {
    name: $("pname").value,
    phone: $("pphone").value
  };

  if (me.role === "patient") {
    Object.assign(b, {
      place: $("pplace").value,
      state: $("pstate").value
    });
  }

  if (me.role === "doctor") {
    const online = $("ponline").checked;
    const home = $("phome").checked;

    if (!online && !home) {
      toast("Select at least one service.");
      return;
    }

    Object.assign(b, {
      specialty: $("pspecialty").value,
      qualification: $("pqualification").value,
      hospitalName: $("phospital").value,
      place: $("pplace").value,
      state: $("pstate").value,
      homeVisitArea: $("parea").value,
      homeVisitPlaces: $("pplaces").value,
      online,
      home
    });
  }

  try {
    const d = await api("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(b)
    });

    me = d.user;
    $("sideName").textContent = me.name;
    toast("Profile updated.");
    go("profile");
  } catch (x) {
    toast(x.message);
  }
}

// ---------------- DOCTOR VERIFICATION ----------------

async function verification() {
  if (me.role === "admin") return adminVerification();

  if (me.role !== "doctor") {
    return '<section class="panel"><h3>Verification</h3><p>This section is for doctors and administrators.</p></section>';
  }

  const status = me.verificationStatus || "pending";
  const request = me.verificationRequest || {};

  return `
    <section class="panel">
      <h3>Get Verified</h3>
      <p>Submit your professional registration document details for demo admin review.</p>
      <p>Current status: <span class="pill ${status}">${esc(status)}</span></p>
      ${me.verificationNote ? `<p>Admin note: ${esc(me.verificationNote)}</p>` : ""}
      ${
        status === "verified"
          ? '<div class="notice">Your doctor profile is approved in this demo and can appear in patient search.</div>'
          : `
            <form onsubmit="submitVerification(event)">
              <div class="formgrid">
                <label>Document type
                  <select id="vtype" required>
                    <option value="">Select document</option>
                    <option ${request.documentType === "Medical registration certificate" ? "selected" : ""}>Medical registration certificate</option>
                    <option ${request.documentType === "Medical degree certificate" ? "selected" : ""}>Medical degree certificate</option>
                    <option ${request.documentType === "Other professional document" ? "selected" : ""}>Other professional document</option>
                  </select>
                </label>
                <label>Document / Registration number
                  <input id="vnumber" maxlength="100" required value="${esc(request.documentNumber || me.registrationNumber || "")}">
                </label>
                <label class="wide">Document details
                  <textarea id="vdetails" rows="4" maxlength="1000" required placeholder="Enter issuing authority, year, and other relevant details">${esc(request.documentDetails || "")}</textarea>
                </label>
              </div>
              <div class="notice">Demo only: This form stores document details as text. It does not upload files or verify credentials with a medical council.</div>
              <button class="btn primary">Submit verification request</button>
            </form>`
      }
    </section>`;
}

async function submitVerification(e) {
  e.preventDefault();

  try {
    const d = await api("/api/verification", {
      method: "POST",
      body: JSON.stringify({
        documentType: $("vtype").value,
        documentNumber: $("vnumber").value,
        documentDetails: $("vdetails").value
      })
    });

    me = d.user;
    toast("Verification request submitted.");
    go("dashboard");
  } catch (x) {
    toast(x.message);
  }
}

// ---------------- ADMIN ----------------

async function adminVerification() {
  const { doctors } = await api("/api/admin/verification");

  const requests = doctors.filter(d => d.verificationRequest);

  if (!requests.length) {
    return `
      <section class="panel">
        <h3>Doctor verification requests</h3>
        <div class="empty">No verification requests have been submitted yet.</div>
      </section>
      <div class="notice">Only doctors who submit the Get Verified form appear here.</div>`;
  }

  return `
    <section class="panel">
      <h3>Doctor verification requests</h3>
      <p>Review submitted details. Approving a doctor makes the profile visible in Patient Find Doctors.</p>
      ${requests.map(d => `
        <article class="review-card">
          <div class="review-head">
            <div>
              <h4>Dr. ${esc(d.name)}</h4>
              <small>${esc(d.email)} · ${esc(d.specialty || "Specialization not provided")}</small>
            </div>
            <span class="pill ${d.verificationStatus}">${esc(d.verificationStatus)}</span>
          </div>

          <div class="review-details">
            <p><b>Qualification:</b> ${esc(d.qualification || "—")}</p>
            <p><b>Hospital:</b> ${esc(d.hospitalName || "—")}</p>
            <p><b>Place:</b> ${esc(d.place || d.city || "—")}</p>
            <p><b>State:</b> ${esc(d.state || "—")}</p>
            <p><b>Registration number:</b> ${esc(d.registrationNumber || "—")}</p>
            <p><b>Document type:</b> ${esc(d.verificationRequest.documentType)}</p>
            <p><b>Document number:</b> ${esc(d.verificationRequest.documentNumber)}</p>
            <p><b>Document details:</b> ${esc(d.verificationRequest.documentDetails)}</p>
            <p><b>Submitted:</b> ${new Date(d.verificationRequest.submittedAt).toLocaleString()}</p>
          </div>

          <label>Admin review note
            <textarea id="note_${d.id}" rows="2" maxlength="500" placeholder="Optional note">${esc(d.verificationNote || "")}</textarea>
          </label>

          <div class="record-actions">
            ${
              d.verificationStatus !== "verified"
                ? `<button class="btn primary" onclick="reviewDoctor('${d.id}','verified')">Approve doctor</button>`
                : ""
            }
            ${
              d.verificationStatus !== "rejected"
                ? `<button class="btn outline" onclick="reviewDoctor('${d.id}','rejected')">Reject request</button>`
                : ""
            }
          </div>
        </article>
      `).join("")}
    </section>
    <div class="notice">Admin review in this demo is not a substitute for official medical credential verification.</div>`;
}

async function reviewDoctor(id, status) {
  const note = $("note_" + id)?.value || "";

  if (!confirm(status === "verified"
    ? "Approve this doctor in the MEDICO demo?"
    : "Reject this doctor's verification request?")) return;

  try {
    await api("/api/admin/doctors/" + id + "/verification", {
      method: "PATCH",
      body: JSON.stringify({ status, note })
    });

    toast(status === "verified" ? "Doctor approved." : "Request rejected.");
    go("verification");
  } catch (e) {
    toast(e.message);
  }
}

// ---------------- APPOINTMENTS ----------------

async function appointments() {
  const { appointments: a } = await api("/api/appointments");

  return `
    <section class="panel">
      <h3>${me.role === "patient" ? "Your appointment history" : "Patient appointment requests"}</h3>
      ${
        a.length
          ? a.map(x => `
            ${aptRow(x)}
            ${
              me.role === "doctor"
                ? `<div class="record-actions appointment-actions">
                    ${x.type === "home" ? `<p class="address-line"><b>Patient home visit address:</b><br>${esc(x.patientAddress || "Not provided")}</p>` : ""}
                    ${x.reason ? `<p class="address-line"><b>Reason:</b> ${esc(x.reason)}</p>` : ""}
                    ${x.status === "Pending" ? `
                      <button class="btn soft small" onclick="setApt('${x.id}','Confirmed')">Confirm</button>
                      <button class="btn outline small" onclick="setApt('${x.id}','Declined')">Decline</button>` : ""}
                    ${x.status !== "Declined" ? `
                      <button class="btn primary small" onclick="setApt('${x.id}','Completed')">Mark completed</button>
                      <button class="btn outline small" onclick="sendRecord('${x.id}','prescription')">＋ Prescription</button>
                      <button class="btn outline small" onclick="sendRecord('${x.id}','report')">＋ Report</button>
                      <button class="btn soft small" onclick="openChat('${x.patientId}',${JSON.stringify(x.patientName)})">Message patient</button>` : ""}
                  </div>`
                : ""
            }
          `).join("")
          : '<div class="empty">No appointments available.</div>'
      }
    </section>`;
}

async function setApt(id, status) {
  try {
    await api("/api/appointments/" + id, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    toast("Appointment status updated.");
    go("appointments");
  } catch (e) {
    toast(e.message);
  }
}

// ---------------- FIND DOCTORS ----------------

async function doctors() {
  const { doctors: d } = await api("/api/doctors");
  doctorCache = d;

  return `
    <section class="panel">
      <h3>Find a doctor</h3>
      <p>Only doctors approved by the MEDICO demo administrator are listed here.</p>
      ${
        d.length
          ? `<div class="doctor-grid">${d.map(x => `
              <article class="doctor doctor-card">
                <div class="docicon">🩺</div>
                <h4>Dr. ${esc(x.name)}</h4>
                <p><b>Specialization:</b> ${esc(x.specialty || "General Physician")}</p>
                <p><b>Qualification:</b> ${esc(x.qualification || "—")}</p>
                <p><b>Hospital:</b> ${esc(x.hospitalName || "Not provided")}</p>
                <p><b>Place:</b> ${esc(x.place || x.city || "Not provided")}</p>
                <p><b>State:</b> ${esc(x.state || "Not provided")}</p>
                <div class="service-tags">
                  ${x.services?.online ? '<span class="service-tag">💻 Online available</span>' : ""}
                  ${x.services?.home ? '<span class="service-tag">🏠 Home visit</span>' : ""}
                </div>
                ${x.services?.home ? `
                  <p><b>Home visit area:</b> ${esc(x.homeVisitArea || "Contact doctor")}</p>
                  <p><b>Home visit places:</b> ${esc(x.homeVisitPlaces || "Contact doctor")}</p>` : ""}
                <button class="btn primary full" onclick="booking('${x.id}')">Book appointment</button>
                <button class="btn soft full chat-doctor-btn" onclick="openChat('${x.id}',${JSON.stringify("Dr. " + x.name)})">✉ Chat / Message</button>
              </article>
            `).join("")}</div>`
          : '<div class="empty">No verified doctors listed yet. Doctor profiles appear here after admin approval.</div>'
      }
    </section>
    <div class="notice">Online consultation and home visits are booking request types only. Live video calling and home-visit logistics are not connected in this prototype.</div>`;
}

function booking(id) {
  const doctor = doctorCache.find(d => d.id === id);

  if (!doctor) {
    toast("Doctor details not found. Please refresh the list.");
    return;
  }

  const services = doctor.services || { online: true, home: false };
  const options = [
    services.online ? '<option value="online">Online consultation</option>' : "",
    services.home ? '<option value="home">Doctor home visit</option>' : ""
  ].join("");

  if (!options) {
    toast("This doctor has not selected any booking service.");
    return;
  }

  $("view").innerHTML = `
    <section class="panel">
      <button class="btn outline small" onclick="go('doctors')">← Back to doctors</button>
      <h3 class="booking-title">Appointment with Dr. ${esc(doctor.name)}</h3>
      <p>${esc(doctor.hospitalName || "")} · ${esc(doctor.place || doctor.city || "")} · ${esc(doctor.state || "")}</p>
      <form onsubmit="submitBooking(event,'${doctor.id}')">
        <div class="formgrid">
          <label>Appointment type
            <select id="btype" onchange="toggleAddress()">${options}</select>
          </label>
          <label>Date
            <input id="bdate" type="date" min="${new Date().toISOString().slice(0, 10)}" required>
          </label>
          <label>Preferred time<input id="btime" type="time" required></label>

          <div class="wide hidden" id="addressWrap">
            <div class="formgrid">
              <label>House No. / Street
                <input id="bhouse" maxlength="120" placeholder="House number and street">
              </label>
              <label>Area / Locality
                <input id="barea" maxlength="120" placeholder="Area or locality">
              </label>
              <label>Place
                <input id="bplace" maxlength="80" placeholder="City / Town">
              </label>
              <label>State
                <input id="bstate" maxlength="80" placeholder="State">
              </label>
              <label>PIN Code
                <input id="bpincode" maxlength="10" inputmode="numeric" placeholder="PIN code">
              </label>
              <label>Landmark (optional)
                <input id="blandmark" maxlength="120" placeholder="Nearby landmark">
              </label>
            </div>
          </div>

          <label class="wide">Reason for appointment
            <textarea id="breason" rows="3" maxlength="500" placeholder="Briefly describe why you need an appointment"></textarea>
          </label>
        </div>
        <div id="bookError" class="error"></div>
        <button class="btn primary">Submit appointment request</button>
      </form>
    </section>`;

  toggleAddress();
}

function toggleAddress() {
  const isHome = $("btype")?.value === "home";
  const wrap = $("addressWrap");
  if (!wrap) return;

  wrap.classList.toggle("hidden", !isHome);

  ["bhouse", "barea", "bplace", "bstate", "bpincode"].forEach(id => {
    const field = $(id);
    if (field) field.required = isHome;
  });
}

async function submitBooking(e, id) {
  e.preventDefault();

  const type = $("btype").value;
  let address = "";
  let addressDetails = null;

  if (type === "home") {
    addressDetails = {
      house: $("bhouse").value.trim(),
      area: $("barea").value.trim(),
      place: $("bplace").value.trim(),
      state: $("bstate").value.trim(),
      pincode: $("bpincode").value.trim(),
      landmark: $("blandmark").value.trim()
    };

    if (
      !addressDetails.house ||
      !addressDetails.area ||
      !addressDetails.place ||
      !addressDetails.state ||
      !addressDetails.pincode
    ) {
      $("bookError").textContent = "Please complete all required home address fields.";
      return;
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

  const b = {
    type,
    date: $("bdate").value,
    time: $("btime").value,
    reason: $("breason").value,
    address,
    addressDetails,
    doctorId: id
  };

  try {
    await api("/api/appointments", {
      method: "POST",
      body: JSON.stringify(b)
    });

    toast("Appointment request sent to the doctor.");
    go("appointments");
  } catch (x) {
    $("bookError").textContent = x.message;
  }
}

// ---------------- CHAT / MESSAGES ----------------

async function messages() {
  if (me.role === "patient") {
    const { doctors: d } = await api("/api/doctors");

    return `
      <section class="panel">
        <h3>Message a doctor</h3>
        <p>Select a verified doctor to start or continue a conversation.</p>
        ${
          d.length
            ? d.map(x => `
                <div class="row">
                  <div class="docicon">🩺</div>
                  <div class="grow">
                    <strong>Dr. ${esc(x.name)}</strong>
                    <small>${esc(x.specialty || "General Physician")} · ${esc(x.place || x.city || "")}, ${esc(x.state || "")}</small>
                  </div>
                  <button class="btn soft small" onclick="openChat('${x.id}',${JSON.stringify("Dr. " + x.name)})">Open chat</button>
                </div>
              `).join("")
            : '<div class="empty">No verified doctors are available yet.</div>'
        }
      </section>`;
  }

  if (me.role === "doctor") {
    const { appointments: a } = await api("/api/appointments");
    const patients = [...new Map(a.map(x => [x.patientId, x])).values()];

    return `
      <section class="panel">
        <h3>Patient conversations</h3>
        <p>You can message patients who have appointments with you.</p>
        ${
          patients.length
            ? patients.map(x => `
                <div class="row">
                  <div class="docicon">👤</div>
                  <div class="grow">
                    <strong>${esc(x.patientName)}</strong>
                    <small>Appointment: ${esc(x.date)} · ${esc(x.status)}</small>
                  </div>
                  <button class="btn soft small" onclick="openChat('${x.patientId}',${JSON.stringify(x.patientName)})">Open chat</button>
                </div>
              `).join("")
            : '<div class="empty">No appointment-linked patients yet.</div>'
        }
      </section>`;
  }

  return '<section class="panel"><p>Messaging is not available for this account.</p></section>';
}

async function openChat(otherId, otherName) {
  activeChatId = otherId;
  activeChatName = otherName;
  currentPage = "messages";
  buildNav();
  $("pageTitle").textContent = "Messages";
  $("pageSub").textContent = "Chat with " + otherName;
  await renderChat();
}

async function renderChat() {
  $("view").innerHTML = '<section class="panel">Loading conversation…</section>';

  try {
    const { messages: list } = await api("/api/messages/" + encodeURIComponent(activeChatId));

    $("view").innerHTML = `
      <section class="panel chat-panel">
        <div class="chat-heading">
          <div>
            <h3>${esc(activeChatName)}</h3>
            <small>MEDICO messages</small>
          </div>
          <button class="btn outline small" onclick="go('messages')">← Conversations</button>
        </div>

        <div id="chatMessages" class="chat-messages">
          ${
            list.length
              ? list.map(m => `
                  <div class="message ${m.senderId === me.id ? "mine" : "theirs"}">
                    <small>${esc(m.senderName)} · ${new Date(m.createdAt).toLocaleString()}</small>
                    <p>${esc(m.message)}</p>
                  </div>
                `).join("")
              : '<div class="empty">No messages yet. Start the conversation.</div>'
          }
        </div>

        <form class="chat-compose" onsubmit="sendMessage(event)">
          <textarea id="chatText" rows="2" maxlength="2000" placeholder="Type your message…" required></textarea>
          <button class="btn primary">Send</button>
        </form>
        <button class="btn outline small refresh-chat" onclick="renderChat()">↻ Refresh messages</button>
      </section>`;

    const box = $("chatMessages");
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    $("view").innerHTML = `<section class="panel error">${esc(e.message)}</section>`;
  }
}

async function sendMessage(e) {
  e.preventDefault();
  const message = $("chatText").value.trim();
  if (!message) return;

  try {
    await api("/api/messages/" + encodeURIComponent(activeChatId), {
      method: "POST",
      body: JSON.stringify({ message })
    });
    await renderChat();
  } catch (x) {
    toast(x.message);
  }
}

// ---------------- RECORDS ----------------

async function records() {
  const { records: r } = await api("/api/records");

  return `
    <section class="panel">
      <h3>${me.role === "patient" ? "Your prescriptions and medical reports" : "Records sent to patients"}</h3>
      ${
        r.length
          ? r.map(x => `
              <article class="record">
                <div class="record-foot">
                  <span class="pill">${x.kind === "prescription" ? "Prescription" : "Medical report"}</span>
                  <span>${new Date(x.createdAt).toLocaleString()}</span>
                </div>
                <h4>${esc(x.title)}</h4>
                <small>Dr. ${esc(x.doctorName)} · Patient: ${esc(x.patientName)}</small>
                <pre>${esc(x.body)}</pre>
                <div class="record-actions">
                  <button class="btn soft small" onclick="downloadPdf('${x.id}')">↓ Save as PDF</button>
                </div>
              </article>
            `).join("")
          : '<div class="empty">No prescriptions or reports have been sent yet.</div>'
      }
    </section>
    <div class="notice">Doctors can send records from each appointment. Patients see only records linked to their own account.</div>`;
}

async function sendRecord(appointmentId, kind) {
  const title = prompt(
    kind === "prescription" ? "Prescription title:" : "Report title:",
    kind === "prescription" ? "Prescription" : "Medical report"
  );
  if (!title) return;

  const body = prompt("Enter medicine/instructions or report details:");
  if (!body) return;

  try {
    await api("/api/records", {
      method: "POST",
      body: JSON.stringify({ appointmentId, kind, title, body })
    });
    toast("Record sent to the patient's account.");
    go("appointments");
  } catch (e) {
    toast(e.message);
  }
}

async function downloadPdf(id) {
  const { records } = await api("/api/records");
  const r = records.find(x => x.id === id);
  if (!r) return;

  const w = window.open("", "_blank");
  if (!w) {
    toast("Allow pop-ups to print/save PDF.");
    return;
  }

  w.document.write(`<!doctype html>
    <html><head><title>${esc(r.title)}</title>
    <style>
      body{font-family:Arial;padding:45px;color:#173747}
      h1{color:#087f85}
      pre{white-space:pre-wrap;font:15px/1.7 Arial}
      .muted{color:#667}
    </style></head><body>
    <h1>MEDICO</h1><h2>${esc(r.title)}</h2>
    <p class="muted">${esc(r.kind)} · ${new Date(r.createdAt).toLocaleString()}</p>
    <p>Doctor: Dr. ${esc(r.doctorName)}<br>Patient: ${esc(r.patientName)}</p>
    <hr><pre>${esc(r.body)}</pre><hr>
    <p class="muted">Generated from MEDICO demo application.</p>
    <script>window.onload=()=>window.print()<\\/script>
    </body></html>`);
  w.document.close();
}

// ---------------- MEDICINES ----------------

async function medicines() {
  const { medicines: m } = await api("/api/medicines");

  return `
    <section class="panel">
      <h3>Healthcare essentials</h3>
      <div class="medicine-grid">
        ${m.map(x => `
          <article class="med">
            <div class="docicon">💊</div>
            <h4>${esc(x.name)}</h4>
            <p>${esc(x.category)}</p>
            <b>Indicative ₹${x.price}</b>
            <p><button class="btn soft small" onclick="toast('Online ordering is a future feature in this demo.')">View item</button></p>
          </article>
        `).join("")}
      </div>
    </section>
    <div class="notice">Illustrative catalogue only. Checkout, payment, stock availability, prescription validation and pharmacy delivery are not implemented. Do not self-medicate.</div>`;
}

// ---------------- TOAST ----------------

function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("toast");
  setTimeout(() => $("toast").classList.remove("toast"), 3000);
}

check();
