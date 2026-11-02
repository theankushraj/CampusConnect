const api = {
  token() {
    return localStorage.getItem("cc_token") || "";
  },
  user() {
    const raw = localStorage.getItem("cc_user");
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem("cc_token", token);
    localStorage.setItem("cc_user", JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
  },
  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    if (this.token()) headers.Authorization = `Bearer ${this.token()}`;
    const res = await fetch(`/api${path}`, { ...options, headers });
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      this.clear();
      if (!location.pathname.endsWith("login.html")) location.href = "/login.html";
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(path) {
    return this.request(path);
  },
  post(path, body) {
    return this.request(path, { method: "POST", body: JSON.stringify(body || {}) });
  },
  put(path, body) {
    return this.request(path, { method: "PUT", body: JSON.stringify(body || {}) });
  },
  patch(path, body) {
    return this.request(path, { method: "PATCH", body: JSON.stringify(body || {}) });
  },
};
