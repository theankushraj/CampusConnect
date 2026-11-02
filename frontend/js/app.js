const user = api.user();
if (!user || !api.token()) location.href = "/login.html";

const view = document.getElementById("view");
document.getElementById("role-label").textContent = user.role;
document.getElementById("who").innerHTML = `<strong>${escapeHtml(user.name)}</strong><br>${escapeHtml(user.email)}`;
document.getElementById("logout").onclick = () => {
  api.clear();
  location.href = "/";
};

const links = [
  ["#/", "Dashboard"],
  ["#/events", "Events"],
];
if (user.role === "student") links.push(["#/tickets", "My tickets"]);
if (user.role === "organizer" || user.role === "admin") {
  links.push(["#/events/new", "Create event"]);
  links.push(["#/scanner", "QR check-in"]);
}
if (user.role === "admin") {
  links.push(["#/approvals", "Approvals"]);
  links.push(["#/users", "Users"]);
}
links.push(["#/notifications", "Notifications"]);

document.getElementById("nav").innerHTML = links
  .map(([href, label]) => `<a href="${href}">${label}</a>`)
  .join("");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmt(date) {
  if (!date) return "";
  return new Date(date).toLocaleString();
}

function setActive() {
  const hash = location.hash || "#/";
  document.querySelectorAll(".side a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === hash || (hash.startsWith(a.getAttribute("href")) && a.getAttribute("href") !== "#/" && hash.startsWith(a.getAttribute("href") + "/")));
  });
}

async function route() {
  setActive();
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);
  try {
    if (parts.length === 0) return dashboard();
    if (parts[0] === "events" && parts[1] === "new") return eventForm();
    if (parts[0] === "events" && parts[2] === "edit") return eventForm(parts[1]);
    if (parts[0] === "events" && parts[2] === "participants") return participants(parts[1]);
    if (parts[0] === "events" && parts[1]) return eventDetail(parts[1]);
    if (parts[0] === "events") return events();
    if (parts[0] === "tickets" && parts[1]) return ticket(parts[1]);
    if (parts[0] === "tickets") return tickets();
    if (parts[0] === "scanner") return scanner();
    if (parts[0] === "approvals") return approvals();
    if (parts[0] === "users") return users();
    if (parts[0] === "notifications") return notifications();
    view.innerHTML = "<p>Page not found.</p>";
  } catch (err) {
    view.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function dashboard() {
  const data = await api.get("/analytics/overview");
  const t = data.totals || {};
  let stats = "";
  if (user.role === "admin") {
    stats = stat("Students", t.students) + stat("Events", t.events) + stat("Registrations", t.registrations) + stat("Check-ins", t.attendance);
  } else if (user.role === "organizer") {
    stats = stat("Your events", t.events) + stat("Published", t.published_events) + stat("Registrations", t.registrations) + stat("Attendance", t.attendance);
  } else {
    stats = stat("Registrations", t.registrations) + stat("Events attended", t.attended);
  }
  const items = (data.events || data.recent_events || data.registrations || []).slice(0, 4);
  view.innerHTML = `
    <h1>Good to see you, ${escapeHtml(user.name.split(" ")[0])}</h1>
    <p class="muted">${roleCopy()}</p>
    <div class="grid four" style="margin-top:24px">${stats}</div>
    <h2 style="margin-top:32px">Events</h2>
    <div class="grid two">${items.map(cardFromItem).join("") || "<p>Nothing here yet.</p>"}</div>
  `;
}

function roleCopy() {
  if (user.role === "student") return "Browse published campus events and keep your QR tickets handy.";
  if (user.role === "organizer") return "Create events, watch registrations and scan tickets at the door.";
  return "Approve events, manage accounts and monitor campus-wide participation.";
}

function stat(label, value) {
  return `<div class="stat"><span class="gold">${escapeHtml(label)}</span><b>${value ?? 0}</b></div>`;
}

function cardFromItem(item) {
  const event = item.event || item;
  return `<a class="card" href="#/events/${event.event_id}">
    <div class="gold">${escapeHtml(event.category || "")}</div>
    <h3>${escapeHtml(event.event_name)}</h3>
    <p class="muted">${escapeHtml(event.venue || "")} · ${event.registered_count ?? 0}/${event.capacity ?? 0} seats</p>
  </a>`;
}

async function events() {
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  const mine = user.role === "organizer";
  const list = await api.get("/events" + (mine ? "?mine=true" : ""));
  view.innerHTML = `
    <div class="row">
      <div>
        <h1>Campus events</h1>
        <p class="muted">Dates, venues, remaining seats and eligibility.</p>
      </div>
      ${user.role !== "student" ? '<a class="btn" href="#/events/new">New event</a>' : ""}
    </div>
    <div class="grid two" style="margin-top:20px">
      ${list.map((e) => `
        <a class="card" href="#/events/${e.event_id}">
          <div class="row"><span class="gold">${escapeHtml(e.category)}</span><span class="pill">${escapeHtml(e.status)}</span></div>
          <h3>${escapeHtml(e.event_name)}</h3>
          <p class="muted">${escapeHtml(e.description).slice(0, 140)}</p>
          <p>${fmt(e.event_date)} · ${escapeHtml(e.venue)}</p>
          <p class="muted">${e.seats_remaining} of ${e.capacity} seats remaining</p>
        </a>`).join("") || "<p>No events match this view.</p>"}
    </div>
  `;
}

async function eventDetail(id) {
  const e = await api.get(`/events/${id}`);
  const canManage = user.role === "admin" || (user.role === "organizer" && e.organizer_id === user.user_id);
  view.innerHTML = `
    <p class="gold">${escapeHtml(e.category)}</p>
    <h1>${escapeHtml(e.event_name)}</h1>
    <p>${escapeHtml(e.description)}</p>
    ${e.banner_url ? `<img src="${e.banner_url}" alt="" style="max-height:240px;width:100%;object-fit:cover;border-radius:20px">` : ""}
    <div class="grid two" style="margin-top:16px">
      <div><div class="muted">When</div>${fmt(e.event_date)}</div>
      <div><div class="muted">Venue</div>${escapeHtml(e.venue)}</div>
      <div><div class="muted">Capacity</div>${e.registered_count} registered · ${e.seats_remaining} remaining</div>
      <div><div class="muted">Eligibility</div>${escapeHtml(e.eligibility)}</div>
    </div>
    <p id="msg"></p>
    <p class="row" style="margin-top:20px" id="actions"></p>
  `;
  const actions = document.getElementById("actions");
  if (user.role === "student" && e.status === "published" && !e.my_registration) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Register";
    btn.onclick = async () => {
      try {
        const reg = await api.post(`/events/${id}/register`);
        location.hash = `#/tickets/${reg.registration_id}`;
      } catch (err) {
        document.getElementById("msg").innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
      }
    };
    actions.appendChild(btn);
  }
  if (e.my_registration) {
    actions.innerHTML += `<a class="btn gold" href="#/tickets/${e.my_registration.registration_id}">View ticket</a>`;
  }
  if (canManage) {
    actions.innerHTML += `<a class="btn ghost" href="#/events/${id}/edit">Edit</a>
      <a class="btn ghost" href="#/events/${id}/participants">Participants</a>`;
  }
}

async function eventForm(id) {
  const categories = await api.get("/events/categories");
  const existing = id ? await api.get(`/events/${id}`) : null;
  const local = (d) => (d ? new Date(d).toISOString().slice(0, 16) : "");
  view.innerHTML = `
    <h1>${id ? "Edit event" : "Create event"}</h1>
    <p class="muted">New events stay pending until an administrator publishes them.</p>
    <form id="ef" class="card" style="margin-top:16px">
      <div id="error" class="error hidden"></div>
      <label>Name <input name="event_name" required value="${escapeHtml(existing?.event_name || "")}"></label>
      <label>Description <textarea name="description" required>${escapeHtml(existing?.description || "")}</textarea></label>
      <label>Event date <input type="datetime-local" name="event_date" required value="${local(existing?.event_date)}"></label>
      <label>Registration deadline <input type="datetime-local" name="registration_deadline" value="${local(existing?.registration_deadline)}"></label>
      <label>Venue <input name="venue" required value="${escapeHtml(existing?.venue || "")}"></label>
      <label>Capacity <input type="number" min="1" name="capacity" value="${existing?.capacity || 50}"></label>
      <label>Category <select name="category">${categories.map((c) => `<option ${existing?.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>Eligibility <input name="eligibility" value="${escapeHtml(existing?.eligibility || "Open to all students")}"></label>
      <button class="btn">Save event</button>
    </form>
  `;
  document.getElementById("ef").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const payload = Object.fromEntries(fd.entries());
    payload.capacity = Number(payload.capacity);
    payload.event_date = new Date(payload.event_date).toISOString();
    payload.registration_deadline = payload.registration_deadline
      ? new Date(payload.registration_deadline).toISOString()
      : null;
    try {
      const saved = id ? await api.put(`/events/${id}`, payload) : await api.post("/events", payload);
      location.hash = `#/events/${saved.event_id}`;
    } catch (err) {
      const box = document.getElementById("error");
      box.textContent = err.message;
      box.classList.remove("hidden");
    }
  };
}

async function tickets() {
  const rows = await api.get("/registrations/me");
  view.innerHTML = `<h1>My tickets</h1>
    <div class="grid two">${rows.map((r) => `
      <a class="ticket" href="#/tickets/${r.registration_id}">
        <div class="gold">${escapeHtml(r.event?.category)}</div>
        <h2>${escapeHtml(r.event?.event_name)}</h2>
        <p>${escapeHtml(r.event?.venue)}</p>
        <p>REG-${r.registration_id}</p>
        <p class="gold">${r.attended ? "Checked in" : r.status}</p>
      </a>`).join("") || "<p>You have not registered for an event yet.</p>"}</div>`;
}

async function ticket(id) {
  const t = await api.get(`/registrations/${id}`);
  view.innerHTML = `
    <div class="ticket" style="max-width:420px;margin:0 auto">
      <p class="gold">CampusConnect ticket</p>
      <h1>${escapeHtml(t.event?.event_name)}</h1>
      <p>${escapeHtml(t.event?.venue)}</p>
      <div class="perforation"></div>
      <img class="qr" alt="QR ticket" src="/api/registrations/${id}/qr" />
      <p style="text-align:center">REG-${t.registration_id}</p>
      <p class="gold" style="text-align:center">${t.attended ? "Attendance recorded" : "Present this code at check-in"}</p>
    </div>
  `;
  const img = view.querySelector("img");
  const res = await fetch(`/api/registrations/${id}/qr`, { headers: { Authorization: `Bearer ${api.token()}` } });
  img.src = URL.createObjectURL(await res.blob());
}

async function participants(id) {
  const rows = await api.get(`/events/${id}/participants`);
  const stats = await api.get(`/analytics/events/${id}`);
  view.innerHTML = `
    <div class="row">
      <h1>Participants</h1>
      <button class="btn ghost" id="csv">Download CSV</button>
    </div>
    <p class="muted">${stats.registered} registered · ${stats.attended} checked in · ${stats.attendance_rate}% attendance</p>
    <table><thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Status</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.student?.name)}</td><td>${escapeHtml(r.student?.email)}</td><td>${escapeHtml(r.student?.department)}</td><td>${r.attended ? "attended" : r.status}</td></tr>`).join("")}</tbody></table>
  `;
  document.getElementById("csv").onclick = async () => {
    const res = await fetch(`/api/events/${id}/participants.csv`, { headers: { Authorization: `Bearer ${api.token()}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `event-${id}-participants.csv`;
    a.click();
  };
}

async function scanner() {
  view.innerHTML = `
    <h1>QR check-in</h1>
    <p class="muted">Scan a student ticket or paste the token. Duplicate attendance is blocked.</p>
    <div id="qr-reader"></div>
    <form id="manual" class="row" style="margin-top:12px">
      <input name="token" placeholder="Paste QR token" style="flex:1">
      <button class="btn">Validate</button>
    </form>
    <p id="scan-error"></p>
    <div id="scan-result"></div>
  `;
  const show = async (qr_token) => {
    const box = document.getElementById("scan-error");
    const result = document.getElementById("scan-result");
    box.innerHTML = "";
    try {
      const data = await api.post("/attendance/checkin", { qr_token });
      result.innerHTML = renderScan(data, true);
    } catch (err) {
      box.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
      if (err.data?.registration) result.innerHTML = renderScan(err.data, false);
    }
  };
  document.getElementById("manual").onsubmit = (e) => {
    e.preventDefault();
    show(new FormData(e.target).get("token"));
  };
  if (window.Html5Qrcode) {
    const html5 = new Html5Qrcode("qr-reader");
    html5.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, (decoded) => show(decoded)).catch(() => {
      document.getElementById("scan-error").innerHTML = '<span class="muted">Camera not available. Enter the token manually.</span>';
    });
  }
}

function renderScan(data, ok) {
  const r = data.registration;
  return `<div class="card"><div class="gold">${ok ? "Checked in" : "Already recorded"}</div>
    <h2>${escapeHtml(r.student?.name)}</h2>
    <p>${escapeHtml(r.event?.event_name)}</p>
    <p class="muted">${escapeHtml(r.student?.email)}</p></div>`;
}

async function approvals() {
  const events = await api.get("/events?status=pending");
  view.innerHTML = `<h1>Event approvals</h1>
    ${events.map((e) => `<div class="card row" style="margin-top:12px">
      <div><h3>${escapeHtml(e.event_name)}</h3><p class="muted">${escapeHtml(e.organizer_name)} · ${escapeHtml(e.venue)}</p></div>
      <div>
        <button class="btn moss" data-act="approve" data-id="${e.event_id}">Approve</button>
        <button class="btn brick" data-act="reject" data-id="${e.event_id}">Reject</button>
      </div>
    </div>`).join("") || "<p>No pending events.</p>"}`;
  view.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.onclick = async () => {
      await api.post(`/admin/events/${btn.dataset.id}/${btn.dataset.act}`);
      approvals();
    };
  });
}

async function users() {
  const rows = await api.get("/admin/users");
  view.innerHTML = `<h1>Users</h1>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
    <tbody>${rows.map((u) => `<tr>
      <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td>
      <td><select data-id="${u.user_id}" class="role">
        <option ${u.role === "student" ? "selected" : ""}>student</option>
        <option ${u.role === "organizer" ? "selected" : ""}>organizer</option>
        <option ${u.role === "admin" ? "selected" : ""}>admin</option>
      </select></td>
      <td><button class="btn ghost" data-toggle="${u.user_id}" data-active="${u.is_active}">${u.is_active ? "Active" : "Inactive"}</button></td>
    </tr>`).join("")}</tbody></table>`;
  view.querySelectorAll("select.role").forEach((sel) => {
    sel.onchange = () => api.patch(`/admin/users/${sel.dataset.id}`, { role: sel.value });
  });
  view.querySelectorAll("button[data-toggle]").forEach((btn) => {
    btn.onclick = async () => {
      await api.patch(`/admin/users/${btn.dataset.toggle}`, { is_active: btn.dataset.active !== "true" });
      users();
    };
  });
}

async function notifications() {
  const data = await api.get("/notifications");
  view.innerHTML = `
    <div class="row"><h1>Notifications</h1><button class="btn ghost" id="all">Mark all read</button></div>
    <p class="muted">${data.unread} unread</p>
    ${data.items.map((i) => `<div class="card" style="margin-top:8px;opacity:${i.is_read ? 0.65 : 1}">
      <p>${escapeHtml(i.message)}</p>
      <p class="gold">${escapeHtml(i.notification_type)} · ${fmt(i.created_at)}</p>
    </div>`).join("")}
  `;
  document.getElementById("all").onclick = async () => {
    await api.post("/notifications/read-all");
    notifications();
  };
}

window.addEventListener("hashchange", route);
route();
