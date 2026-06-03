import { useState, useEffect, useRef } from "react";

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://pltyqiwfpvlgbiemhpnl.supabase.co";
const SUPABASE_KEY = "sb_publishable_hGr62BaI7RplkltVMmlGOg_RWHjeGlg";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── DB HELPERS ────────────────────────────────────────────────────────────────
async function fetchRounds() {
  const rounds = await sb("rounds?select=*&order=date.asc,time.asc");
  const players = await sb("players?select=*&order=joined_at.asc");
  return rounds.map(r => ({
    ...r,
    maxPlayers: r.max_players,
    players: players.filter(p => p.round_id === r.id && !p.is_waitlist),
    waitlist: players.filter(p => p.round_id === r.id && p.is_waitlist),
  }));
}

async function dbCreateRound(r) {
  await sb("rounds", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      id: r.id, course: r.course, date: r.date, time: r.time,
      max_players: r.maxPlayers, notes: r.notes, password: r.password,
      status: "open", lat: r.lat, lng: r.lng, address: r.address,
      created_at: r.createdAt,
    }),
  });
}

async function dbJoinRound(roundId, person, isWaitlist) {
  await sb("players", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      round_id: roundId, name: person.name, rut: person.rut,
      phone: person.phone, email: person.email, handicap: person.handicap,
      transport: person.transport, is_waitlist: isWaitlist,
      joined_at: person.joinedAt,
    }),
  });
}

async function dbUpdateRoundStatus(roundId, status) {
  await sb(`rounds?id=eq.${roundId}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status }),
  });
}

async function dbDeleteRound(roundId) {
  await sb(`players?round_id=eq.${roundId}`, { method: "DELETE", prefer: "return=minimal" });
  await sb(`rounds?id=eq.${roundId}`, { method: "DELETE", prefer: "return=minimal" });
}

async function dbPromoteWaitlist(roundId, waitlist) {
  if (!waitlist.length) return;
  const first = waitlist[0];
  await sb(`players?id=eq.${first.id}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ is_waitlist: false }),
  });
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function hcpLabel(h) {
  const n = Number(h);
  if (n < 0) return `+${Math.abs(n)}`;
  return String(n);
}
function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatDateShort(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}
function validateRut(rut) {
  const clean = rut.replace(/[\.\-]/g, "").toUpperCase();
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1), dv = clean.slice(-1);
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += parseInt(body[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const exp = 11 - (sum % 11);
  return dv === (exp === 11 ? "0" : exp === 10 ? "K" : String(exp));
}
function generateId() { return Math.random().toString(36).slice(2, 9).toUpperCase(); }

function buildWhatsApp(round) {
  const filled = round.players.length;
  const spots = round.maxPlayers - filled;
  const names = round.players.map(p => `• ${p.name} (HCP ${hcpLabel(p.handicap)})`).join("\n");
  const mapsLink = round.lat ? `\n📍 Cómo llegar: https://www.google.com/maps?q=${round.lat},${round.lng}` : "";
  const shareUrl = `${window.location.href.split("?")[0]}?salida=${round.id}`;
  return encodeURIComponent(
    `*SALIDA MBQB*\n` +
    `*Campo:* ${round.course}\n` +
    `*Fecha:* ${formatDate(round.date)}\n` +
    `*Hora:* ${round.time} hrs\n` +
    `*Jugadores:* ${filled}/${round.maxPlayers}${spots > 0 ? ` — ¡quedan ${spots} cupos!` : " — COMPLETO"}\n` +
    (names ? `\n*Inscritos:*\n${names}\n` : "") +
    (round.notes ? `\n*Notas:* ${round.notes}\n` : "") +
    (round.lat ? `\n*Cómo llegar:* https://www.google.com/maps?q=${round.lat},${round.lng}` : "") +
    `\n*Anótate:* ${shareUrl}`
  );
}

const BLANK = { name: "", rut: "", phone: "", email: "", handicap: "18", transport: "none" };

// ── LOGO SVG ──────────────────────────────────────────────────────────────────
function MBQBLogo({ size = 48, color }) {
  const c = color || "#0f3b2e";
  const showSub = size >= 56;
  const vbH = showSub ? 220 : 175;
  const w = Math.round(size * (460 / vbH));
  return (
    <svg width={w} height={size} viewBox={`0 0 460 ${vbH}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* MB */}
      <text x="4" y="162" fontFamily="'Playfair Display', Georgia, serif" fontSize="155" fontWeight="700" fill={c}>MB</text>
      {/* Golf ball circle (replaces the O in MBQB) */}
      <circle cx="285" cy="78" r="63" fill="none" stroke={c} strokeWidth="5"/>
      {/* Golf club diagonal line (the Q tail) */}
      <line x1="228" y1="166" x2="332" y2="10" stroke={c} strokeWidth="5" strokeLinecap="round"/>
      {/* Dimples */}
      <circle cx="270" cy="30" r="4.5" fill={c}/>
      <circle cx="296" cy="24" r="4.5" fill={c}/>
      <circle cx="320" cy="33" r="4.5" fill={c}/>
      <circle cx="249" cy="48" r="4.5" fill={c}/>
      <circle cx="276" cy="43" r="4.5" fill={c}/>
      <circle cx="301" cy="48" r="4.5" fill={c}/>
      <circle cx="326" cy="55" r="4.5" fill={c}/>
      <circle cx="258" cy="66" r="4" fill={c}/>
      <circle cx="284" cy="60" r="4" fill={c}/>
      <circle cx="312" cy="66" r="4" fill={c}/>
      <circle cx="335" cy="74" r="4" fill={c}/>
      <circle cx="268" cy="83" r="4" fill={c}/>
      <circle cx="296" cy="79" r="4" fill={c}/>
      <circle cx="322" cy="87" r="4" fill={c}/>
      <circle cx="282" cy="98" r="3.5" fill={c}/>
      <circle cx="308" cy="101" r="3.5" fill={c}/>
      {/* B */}
      <text x="342" y="162" fontFamily="'Playfair Display', Georgia, serif" fontSize="155" fontWeight="700" fill={c}>B</text>
      {/* Subtitle */}
      {showSub && <>
        <line x1="4" y1="188" x2="62" y2="188" stroke={c} strokeWidth="1.5"/>
        <text x="232" y="196" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontSize="13" letterSpacing="3.5" fill={c}>MÁS BOGEYS QUE BIRDIES</text>
        <line x1="402" y1="188" x2="460" y2="188" stroke={c} strokeWidth="1.5"/>
      </>}
    </svg>
  );
}

// ── COURSE SEARCH ──────────────────────────────────────────────────────────────
function CourseSearch({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  function handleChange(e) {
    const v = e.target.value;
    onChange(v);
    clearTimeout(timer.current);
    if (v.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(v + " golf club Chile")}&format=json&limit=5&countrycodes=cl&accept-language=es`);
        const data = await res.json();
        setSuggestions(data);
        setOpen(true);
      } catch (_) {}
      setSearching(false);
    }, 500);
  }

  function pick(s) {
    onChange(s.display_name.split(",")[0]);
    onSelect({ name: s.display_name.split(",")[0], lat: parseFloat(s.lat), lng: parseFloat(s.lon), address: s.display_name });
    setSuggestions([]); setOpen(false);
  }

  const S = {
    wrap: { position: "relative" },
    icon: { position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none", zIndex: 1 },
    input: { width: "100%", background: "#fff", border: "1.5px solid #d4c9b8", borderRadius: 10, padding: "11px 14px 11px 40px", fontSize: 14, fontFamily: "'Source Serif 4', serif", color: "#0f3b2e", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" },
    dropdown: { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1.5px solid #d4c9b8", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 24px rgba(15,59,46,0.12)" },
    item: { padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f0ebe3", fontSize: 13 },
    itemName: { fontWeight: 600, color: "#0f3b2e" },
    itemSub: { fontSize: 11, color: "#6f7a6b", marginTop: 2 },
    hint: { fontSize: 11, color: "#ac9572", marginTop: 5 },
  };

  return (
    <div style={S.wrap}>
      <span style={S.icon}>{searching ? "⏳" : "📍"}</span>
      <input style={S.input} placeholder="ej. Club de Golf Los Leones, Marbella..." value={value}
        onChange={handleChange} onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)} autoComplete="off"
        onFocus={e => e.target.style.borderColor = "#0f3b2e"}
        onBlur={e => { e.target.style.borderColor = "#d4c9b8"; setTimeout(() => setOpen(false), 200); }}
      />
      {open && suggestions.length > 0 && (
        <div style={S.dropdown}>
          {suggestions.map((s, i) => (
            <div key={i} style={S.item} onMouseDown={() => pick(s)}
              onMouseEnter={e => e.currentTarget.style.background = "#f5f1eb"}
              onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
              <div style={S.itemName}>{s.display_name.split(",")[0]}</div>
              <div style={S.itemSub}>{s.display_name.split(",").slice(1, 3).join(",")}</div>
            </div>
          ))}
        </div>
      )}
      <div style={S.hint}>Escribe para buscar campos en Chile</div>
    </div>
  );
}

// ── MAP EMBED ──────────────────────────────────────────────────────────────────
function MapEmbed({ course, lat, lng }) {
  const fallback = `https://www.google.com/maps?q=${lat},${lng}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1.5px solid #d4c9b8", position: "relative" }}>
      <iframe title="Mapa" src={src} width="100%" height="220"
        style={{ display: "block", border: "none", filter: "sepia(0.3) saturate(0.8) hue-rotate(40deg)" }}
        allowFullScreen loading="lazy" />
      <a href={fallback} target="_blank" rel="noreferrer"
        style={{ position: "absolute", bottom: 10, right: 10, background: "#0f3b2e", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#f5f1eb", textDecoration: "none", fontFamily: "'Source Serif 4', serif", display: "flex", alignItems: "center", gap: 5 }}>
        📍 Abrir en Maps
      </a>
    </div>
  );
}

// ── STATUS BADGE ──────────────────────────────────────────────────────────────
function StatusBadge({ count, max, waitlist }) {
  const full = count >= max;
  const pct = count / max;
  const bg = full ? "#fde8e8" : pct >= 0.5 ? "#fef3e0" : "#e8f5ee";
  const color = full ? "#9b2020" : pct >= 0.5 ? "#92580a" : "#1a6b38";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: "3px 10px", borderRadius: 20, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {full ? "Completo" : `${count}/${max} jugadores`}
      </span>
      {full && waitlist > 0 && (
        <span style={{ fontSize: 10, color: "#7a5a20", background: "#fdf0d8", padding: "2px 8px", borderRadius: 20, border: "1px solid #e8c87a" }}>
          {waitlist} en espera
        </span>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [rounds, setRounds] = useState([]);
  const [view, setView] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newRound, setNewRound] = useState({ course: "", date: "", time: "", maxPlayers: 4, notes: "", password: "", lat: null, lng: null, address: "" });
  const [roundError, setRoundError] = useState("");
  const [roundSuccess, setRoundSuccess] = useState(false);
  const [joinForm, setJoinForm] = useState(BLANK);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [joinMode, setJoinMode] = useState("confirmed");
  const [modal, setModal] = useState(null);
  const [orgPwd, setOrgPwd] = useState("");
  const [orgError, setOrgError] = useState("");
  const [copied, setCopied] = useState(false);
  const today = new Date().toISOString().split("T")[0];


  useEffect(() => {
    async function load() {
      try { const data = await fetchRounds(); setRounds(data); } catch (_) {}
      const p = new URLSearchParams(window.location.search);
      const sid = p.get("salida");
      if (sid) { setSelectedId(sid); setView("detail"); }
      setLoading(false);
    }
    load();
  }, []);

  async function reloadRounds() {
    try { const data = await fetchRounds(); setRounds(data); } catch (_) {}
  }

  async function createRound() {
    setRoundError("");
    if (!newRound.course.trim()) return setRoundError("Ingresa el nombre del campo.");
    if (!newRound.date) return setRoundError("Selecciona una fecha.");
    if (!newRound.time) return setRoundError("Selecciona una hora.");
    if (!newRound.password.trim()) return setRoundError("Define una contraseña de organizador.");
    if (new Date(newRound.date + "T" + newRound.time) < new Date()) return setRoundError("La fecha y hora ya pasaron.");
    const r = { id: generateId(), course: newRound.course.trim(), date: newRound.date, time: newRound.time, maxPlayers: Number(newRound.maxPlayers), notes: newRound.notes.trim(), password: newRound.password.trim(), status: "open", players: [], waitlist: [], lat: newRound.lat, lng: newRound.lng, address: newRound.address, createdAt: new Date().toISOString() };
    try {
      await dbCreateRound(r);
      setNewRound({ course: "", date: "", time: "", maxPlayers: 4, notes: "", password: "", lat: null, lng: null, address: "" });
      setRoundSuccess(true);
      await reloadRounds();
      setTimeout(() => { setRoundSuccess(false); setSelectedId(r.id); setView("detail"); }, 1400);
    } catch (_) { setRoundError("Error al guardar. Intenta de nuevo."); }
  }

  async function joinRound(roundId) {
    setJoinError("");
    const { name, rut, phone, email, handicap, transport } = joinForm;
    if (!name.trim()) return setJoinError("Ingresa tu nombre.");
    if (!validateRut(rut)) return setJoinError("RUT inválido. Verifica el dígito verificador.");
    if (!phone.trim()) return setJoinError("Ingresa tu teléfono.");
    if (!email.includes("@")) return setJoinError("Email inválido.");
    const round = rounds.find(r => r.id === roundId);
    if (!round) return;
    const all = [...round.players, ...round.waitlist];
    if (all.some(p => p.rut.replace(/[\.-]/g, "") === rut.replace(/[\.-]/g, ""))) return setJoinError("Ya estás inscrito en esta salida.");
    const person = { name: name.trim(), rut: rut.trim(), phone: phone.trim(), email: email.trim(), handicap, transport, joinedAt: new Date().toISOString() };
    const full = round.players.length >= round.maxPlayers || round.status === "closed";
    try {
      await dbJoinRound(roundId, person, full);
      setJoinMode(full ? "waitlist" : "confirmed");
      setJoinForm(BLANK); setJoinSuccess(true);
      await reloadRounds();
      setTimeout(() => setJoinSuccess(false), 3000);
    } catch (_) { setJoinError("Error al inscribirse. Intenta de nuevo."); }
  }

  async function orgAction(action) {
    const round = rounds.find(r => r.id === selectedId);
    if (!round || orgPwd !== round.password) return setOrgError("Contraseña incorrecta.");
    try {
      if (action === "close") {
        await dbUpdateRoundStatus(selectedId, round.status === "closed" ? "open" : "closed");
      } else if (action === "delete") {
        await dbDeleteRound(selectedId);
        setModal(null); setOrgPwd(""); setOrgError("");
        setView("home"); await reloadRounds(); return;
      } else if (action === "promote") {
        await dbPromoteWaitlist(selectedId, round.waitlist);
      }
      await reloadRounds();
    } catch (_) { setOrgError("Error al realizar la acción. Intenta de nuevo."); return; }
    setModal(null); setOrgPwd(""); setOrgError("");
  }

  function copyLink() { navigator.clipboard.writeText(`${window.location.href.split("?")[0]}?salida=${selectedId}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }

  // ── DESIGN TOKENS ─────────────────────────────────────────────────────────
  const C = { bg: "#f5f1eb", card: "#ffffff", border: "#d4c9b8", green: "#0f3b2e", gold: "#ac9572", sage: "#6f7a6b", text: "#1a2e25", muted: "#6f7a6b", cream: "#f5f1eb" };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Source+Serif+4:wght@300;400;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${C.bg}; }
    input, select { font-family: 'Source Serif 4', serif !important; }
    input::placeholder { color: #b0a898 !important; }
    select option { background: #fff; color: #0f3b2e; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.gold}; border-radius: 4px; }
    .card-hover:hover { border-color: ${C.green} !important; box-shadow: 0 6px 24px rgba(15,59,46,0.10); transform: translateY(-2px); }
    .btn-primary { background: ${C.green}; border: 1.5px solid ${C.green}; color: ${C.cream}; }
    .btn-primary:hover { background: #0a2a20; }
    .btn-ghost { background: transparent; border: 1.5px solid ${C.border}; color: ${C.sage}; }
    .btn-ghost:hover { border-color: ${C.green}; color: ${C.green}; }
    .btn-gold { background: ${C.gold}; border: 1.5px solid ${C.gold}; color: ${C.cream}; }
    .btn-danger { background: #fff; border: 1.5px solid #d4846a; color: #9b3a20; }
    .btn-danger:hover { background: #fdf0ee; }
    .input-field { background: #fff !important; border: 1.5px solid ${C.border} !important; border-radius: 10px !important; padding: 11px 14px !important; color: ${C.text} !important; width: 100%; font-size: 14px; outline: none; transition: border-color 0.2s; }
    .input-field:focus { border-color: ${C.green} !important; box-shadow: 0 0 0 3px rgba(15,59,46,0.08); }
    @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .fade-in { animation: fadeIn 0.3s ease; }
    .divider-ornament { display:flex; align-items:center; gap:12px; }
    .divider-ornament::before, .divider-ornament::after { content:''; flex:1; height:1px; background:${C.border}; }
  `;

  const S = {
    app: { minHeight: "100vh", background: C.bg, fontFamily: "'Source Serif 4', Georgia, serif", color: C.text },
    header: { background: C.green, position: "sticky", top: 0, zIndex: 100 },
    headerInner: { maxWidth: 820, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    logoWrap: { display: "flex", alignItems: "center", gap: 12 },
    logoText: { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: C.cream, letterSpacing: 2, lineHeight: 1 },
    logoSub: { fontSize: 9, letterSpacing: 4, color: C.gold, textTransform: "uppercase", marginTop: 3 },
    main: { maxWidth: 820, margin: "0 auto", padding: "36px 16px 80px" },
    secLabel: { fontSize: 9, letterSpacing: 4, textTransform: "uppercase", color: C.sage, marginBottom: 20, display: "block" },
    card: { background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: "20px 24px", marginBottom: 14, transition: "all 0.2s", cursor: "pointer", textDecoration: "none", display: "block", color: C.text },
    btn: { borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Source Serif 4', serif", transition: "all 0.2s", letterSpacing: 0.5, border: "none", display: "inline-block", textDecoration: "none" },
    formGroup: { marginBottom: 16 },
    label: { fontSize: 10, color: C.sage, marginBottom: 6, display: "block", letterSpacing: 1, textTransform: "uppercase" },
    input: { background: "#fff", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, fontFamily: "'Source Serif 4', serif", color: C.text, width: "100%", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" },
    divider: { borderTop: `1px solid ${C.border}`, margin: "28px 0" },
    pill: { display: "inline-flex", alignItems: "center", gap: 5, background: "#e8f0e8", border: "1px solid #b8d4b8", borderRadius: 20, padding: "3px 10px", fontSize: 12, color: C.green },
    pillEmpty: { display: "inline-block", background: "#f5f1eb", border: `1px dashed ${C.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 12, color: C.sage },
    pillWait: { display: "inline-block", background: "#fdf0d8", border: "1px solid #e8c87a", borderRadius: 20, padding: "3px 10px", fontSize: 12, color: "#7a5a20" },
    modal: { position: "fixed", inset: 0, background: "rgba(15,59,46,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    modalBox: { background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "32px 28px", maxWidth: 380, width: "100%", boxShadow: "0 20px 60px rgba(15,59,46,0.20)" },
    alert: (type) => ({ borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 16, background: type === "error" ? "#fdf0ee" : type === "success" ? "#e8f5ee" : "#fdf8ed", border: `1px solid ${type === "error" ? "#e8c0b0" : type === "success" ? "#9acfaa" : "#e8c87a"}`, color: type === "error" ? "#7a2a10" : type === "success" ? "#1a5a2a" : "#7a5a20" }),
  };

  if (loading) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <MBQBLogo size={64} />
      <div style={{ fontSize: 12, color: C.sage, letterSpacing: 4, textTransform: "uppercase" }}>Cargando...</div>
    </div>
  );

  // ── DETAIL ─────────────────────────────────────────────────────────────────
  if (view === "detail") {
    const round = rounds.find(r => r.id === selectedId);
    if (!round) return <div style={S.app}><style>{css}</style><div style={S.main}><div style={{ color: C.muted, textAlign: "center", paddingTop: 60 }}>Salida no encontrada. <button style={{ ...S.btn, background: "none", border: "none", color: C.green, cursor: "pointer" }} onClick={() => setView("home")}>Volver</button></div></div></div>;
    const isFull = round.players.length >= round.maxPlayers;
    const isClosed = round.status === "closed";
    const canJoin = !isFull && !isClosed;

    return (
      <div style={S.app}>
        <style>{css}</style>
        <div style={S.header}>
          <div style={S.headerInner}>
            <button className="btn-ghost" style={{ ...S.btn, color: C.gold, borderColor: "rgba(172,149,114,0.4)", padding: "7px 14px", fontSize: 12 }} onClick={() => setView("home")}>← Volver</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" style={{ ...S.btn, color: C.gold, borderColor: "rgba(172,149,114,0.4)", padding: "7px 14px", fontSize: 12 }} onClick={copyLink}>{copied ? "✓ Copiado" : "🔗 Link"}</button>
              <a href={`https://wa.me/?text=${buildWhatsApp(round)}`} target="_blank" rel="noreferrer" className="btn-gold" style={{ ...S.btn, fontSize: 12, padding: "7px 14px" }}>📲 WhatsApp</a>
            </div>
          </div>
        </div>

        <div style={S.main} className="fade-in">
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 32, paddingBottom: 28, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><MBQBLogo size={56} /></div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: C.green, marginBottom: 8 }}>{round.course}</h1>
            <div style={{ color: C.sage, fontSize: 14, marginBottom: 10 }}>📅 {formatDate(round.date)} &nbsp;·&nbsp; ⏰ {round.time} hrs</div>
            {round.address && <div style={{ fontSize: 12, color: C.gold }}>📍 {round.address}</div>}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <StatusBadge count={round.players.length} max={round.maxPlayers} waitlist={round.waitlist.length} />
              {round.notes && <span style={{ ...S.pill, background: "#f5f1eb", borderColor: C.border, color: C.sage }}>📝 {round.notes}</span>}
              {isClosed && <span style={{ fontSize: 11, background: "#fdf0ee", border: "1px solid #e8c0b0", color: "#7a2a10", padding: "3px 10px", borderRadius: 20 }}>🔒 Inscripciones cerradas</span>}
            </div>
          </div>

          {/* Mapa */}
          {round.lat && round.lng && (
            <div style={{ marginBottom: 28 }}>
              <span style={S.secLabel}>Ubicación</span>
              <MapEmbed course={round.course} lat={round.lat} lng={round.lng} />
            </div>
          )}
          {!round.lat && (
            <div style={{ marginBottom: 28, textAlign: "center" }}>
              <a href={`https://www.google.com/maps/search/${encodeURIComponent(round.course + " Chile")}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ ...S.btn, fontSize: 12 }}>📍 Ver en Google Maps</a>
            </div>
          )}

          {/* Jugadores */}
          <div style={{ marginBottom: 28 }}>
            <span style={S.secLabel}>Jugadores confirmados ({round.players.length}/{round.maxPlayers})</span>
            {round.players.length === 0
              ? <div style={{ color: C.muted, fontSize: 14, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>Nadie inscrito aún — ¡sé el primero!</div>
              : round.players.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: C.cream, flexShrink: 0 }}>{p.name[0].toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: C.green, fontSize: 15 }}>{p.name} {p.transport === "offer" ? "🚗" : p.transport === "need" ? "✋" : ""}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{p.phone} · {p.email}</div>
                  </div>
                  <div style={{ background: C.green, color: C.gold, borderRadius: 8, padding: "4px 10px", fontSize: 13, fontWeight: 700 }}>HCP {hcpLabel(p.handicap)}</div>
                </div>
              ))}
          </div>

          {/* Lista de espera */}
          {round.waitlist.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <span style={{ ...S.secLabel, color: C.gold }}>Lista de espera ({round.waitlist.length})</span>
              {round.waitlist.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, opacity: 0.75 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fdf0d8", border: "1px solid #e8c87a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#7a5a20", flexShrink: 0, fontWeight: 700 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#7a5a20", fontSize: 14 }}>{p.name} {p.transport === "offer" ? "🚗" : p.transport === "need" ? "✋" : ""}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{p.phone}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.gold }}>HCP {hcpLabel(p.handicap)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Transporte */}
          {round.players.some(p => p.transport !== "none") && (
            <div style={{ background: "#f0f5f0", border: `1px solid #c8d8c8`, borderRadius: 12, padding: "14px 18px", marginBottom: 28 }}>
              <span style={{ ...S.secLabel, marginBottom: 10 }}>Coordinación de transporte</span>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {round.players.filter(p => p.transport === "offer").map((p, i) => <span key={i} style={{ fontSize: 13, color: C.green }}>🚗 {p.name.split(" ")[0]} ofrece</span>)}
                {round.players.filter(p => p.transport === "need").map((p, i) => <span key={i} style={{ fontSize: 13, color: "#7a5a20" }}>✋ {p.name.split(" ")[0]} necesita</span>)}
              </div>
            </div>
          )}

          {/* Formulario */}
          <div style={S.divider} />
          {joinSuccess ? (
            <div style={S.alert(joinMode === "waitlist" ? "warning" : "success")}>
              {joinMode === "waitlist" ? "⏳ Quedaste en lista de espera. Serás el próximo si se libera un cupo." : "✅ ¡Te anotaste correctamente! Hasta la cancha 🏌️"}
            </div>
          ) : (
            <>
              <div className="divider-ornament" style={{ marginBottom: 24 }}>
                <span style={{ ...S.secLabel, marginBottom: 0, letterSpacing: 3 }}>
                  {canJoin ? `Anotarse · ${round.maxPlayers - round.players.length} cupo${round.maxPlayers - round.players.length !== 1 ? "s" : ""} disponible${round.maxPlayers - round.players.length !== 1 ? "s" : ""}` : "Lista de espera"}
                </span>
              </div>
              {(isFull || isClosed) && <div style={S.alert("warning")}>⏳ La salida está completa. Puedes anotarte en la lista de espera.</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[{ k: "name", l: "Nombre completo", p: "Juan Pérez" }, { k: "rut", l: "RUT", p: "12.345.678-9" }, { k: "phone", l: "Teléfono", p: "+56 9 1234 5678" }, { k: "email", l: "Email", p: "juan@mail.com", t: "email" }].map(f => (
                  <div key={f.k} style={S.formGroup}>
                    <label style={S.label}>{f.l}</label>
                    <input className="input-field" style={S.input} placeholder={f.p} type={f.t || "text"}
                      value={joinForm[f.k]} onChange={e => setJoinForm(p => ({ ...p, [f.k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={S.formGroup}>
                  <label style={S.label}>Handicap</label>
                  <select className="input-field" style={S.input} value={joinForm.handicap} onChange={e => setJoinForm(p => ({ ...p, handicap: e.target.value }))}>
                    {Array.from({ length: 55 }, (_, i) => i - 9).map(h => <option key={h} value={h}>{h < 0 ? `+${Math.abs(h)}` : h}</option>)}
                  </select>
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>Transporte</label>
                  <select className="input-field" style={S.input} value={joinForm.transport} onChange={e => setJoinForm(p => ({ ...p, transport: e.target.value }))}>
                    <option value="none">Sin indicar</option>
                    <option value="offer">🚗 Ofrezco transporte</option>
                    <option value="need">✋ Necesito transporte</option>
                  </select>
                </div>
              </div>
              {joinError && <div style={S.alert("error")}>{joinError}</div>}
              <button className="btn-primary" style={{ ...S.btn, fontSize: 14, padding: "13px 28px", marginTop: 8 }} onClick={() => joinRound(round.id)}>
                {canJoin ? "⛳ Anotarme en esta salida" : "⏳ Unirme a lista de espera"}
              </button>
            </>
          )}

          <div style={S.divider} />
          {/* Acciones organizador */}
          <div>
            <span style={{ ...S.secLabel, marginBottom: 12 }}>Zona del organizador</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn-ghost" style={{ ...S.btn, fontSize: 12 }} onClick={() => { setModal("close"); setOrgPwd(""); setOrgError(""); }}>
                {round.status === "closed" ? "🔓 Abrir inscripciones" : "🔒 Cerrar inscripciones"}
              </button>
              {round.waitlist.length > 0 && <button className="btn-ghost" style={{ ...S.btn, fontSize: 12 }} onClick={() => { setModal("promote"); setOrgPwd(""); setOrgError(""); }}>⬆️ Promover siguiente</button>}
              <button className="btn-danger" style={{ ...S.btn, fontSize: 12 }} onClick={() => { setModal("delete"); setOrgPwd(""); setOrgError(""); }}>🗑 Eliminar salida</button>
            </div>
          </div>
        </div>

        {/* Modal */}
        {modal && (
          <div style={S.modal} onClick={() => setModal(null)}>
            <div style={S.modalBox} onClick={e => e.stopPropagation()} className="fade-in">
              <div style={{ textAlign: "center", marginBottom: 20 }}><MBQBLogo size={40} /></div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: C.green, marginBottom: 6 }}>
                {modal === "delete" ? "Eliminar salida" : modal === "close" ? (round.status === "closed" ? "Abrir inscripciones" : "Cerrar inscripciones") : "Promover jugador"}
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
                {modal === "delete" ? "Esta acción no se puede deshacer." : modal === "promote" ? `${round.waitlist[0]?.name} pasará a jugadores confirmados.` : "Ingresa tu contraseña de organizador."}
              </div>
              <label style={S.label}>Contraseña de organizador</label>
              <input className="input-field" style={S.input} type="password" placeholder="Tu contraseña" value={orgPwd}
                onChange={e => { setOrgPwd(e.target.value); setOrgError(""); }} />
              {orgError && <div style={{ color: "#7a2a10", fontSize: 13, marginTop: 8 }}>{orgError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <button className={modal === "delete" ? "btn-danger" : "btn-primary"} style={S.btn} onClick={() => orgAction(modal)}>Confirmar</button>
                <button className="btn-ghost" style={S.btn} onClick={() => setModal(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── NUEVA SALIDA ───────────────────────────────────────────────────────────
  if (view === "new") {
    return (
      <div style={S.app}>
        <style>{css}</style>
        <div style={S.header}>
          <div style={S.headerInner}>
            <div style={S.logoWrap}><MBQBLogo size={44} color={C.cream} /></div>
            <button className="btn-ghost" style={{ ...S.btn, color: C.gold, borderColor: "rgba(172,149,114,0.4)", fontSize: 12 }} onClick={() => setView("home")}>← Ver salidas</button>
          </div>
        </div>
        <div style={S.main} className="fade-in">
          <div className="divider-ornament" style={{ marginBottom: 28 }}><span style={{ ...S.secLabel, marginBottom: 0 }}>Nueva salida de golf</span></div>
          <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "28px 26px", boxShadow: "0 4px 20px rgba(15,59,46,0.06)" }}>
            <div style={S.formGroup}>
              <label style={S.label}>Campo de golf</label>
              <CourseSearch value={newRound.course}
                onChange={v => setNewRound(p => ({ ...p, course: v, lat: null, lng: null, address: "" }))}
                onSelect={({ name, lat, lng, address }) => setNewRound(p => ({ ...p, course: name, lat, lng, address }))} />
            </div>
            {newRound.lat && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...S.secLabel, marginBottom: 8 }}>Vista previa</div>
                <MapEmbed course={newRound.course} lat={newRound.lat} lng={newRound.lng} />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={S.formGroup}><label style={S.label}>Fecha</label><input className="input-field" style={S.input} type="date" min={today} value={newRound.date} onChange={e => setNewRound(p => ({ ...p, date: e.target.value }))} /></div>
              <div style={S.formGroup}><label style={S.label}>Hora de salida</label><input className="input-field" style={S.input} type="time" value={newRound.time} onChange={e => setNewRound(p => ({ ...p, time: e.target.value }))} /></div>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Máximo de jugadores</label>
              <select className="input-field" style={S.input} value={newRound.maxPlayers} onChange={e => setNewRound(p => ({ ...p, maxPlayers: e.target.value }))}>
                {[2, 3, 4].map(n => <option key={n} value={n}>{n} jugadores</option>)}
              </select>
            </div>
            <div style={S.formGroup}><label style={S.label}>Notas (opcional)</label><input className="input-field" style={S.input} placeholder="ej. Salida desde hoyo 10, carro eléctrico..." value={newRound.notes} onChange={e => setNewRound(p => ({ ...p, notes: e.target.value }))} /></div>
            <div style={S.formGroup}>
              <label style={S.label}>Contraseña de organizador</label>
              <input className="input-field" style={S.input} type="password" placeholder="Para cerrar o eliminar la salida después" value={newRound.password} onChange={e => setNewRound(p => ({ ...p, password: e.target.value }))} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Guárdala — la necesitarás para gestionar esta salida.</div>
            </div>
            {roundError && <div style={S.alert("error")}>{roundError}</div>}
            {roundSuccess && <div style={S.alert("success")}>✅ Salida publicada. Redirigiendo...</div>}
            <div style={{ marginTop: 20 }}>
              <button className="btn-primary" style={{ ...S.btn, fontSize: 14, padding: "13px 28px" }} onClick={createRound}>🏌️ Publicar salida</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── HOME ───────────────────────────────────────────────────────────────────
  const upcoming = rounds.filter(r => new Date(r.date + "T" + r.time) >= new Date()).sort((a, b) => new Date(a.date + "T" + a.time) - new Date(b.date + "T" + b.time));
  const past = rounds.filter(r => new Date(r.date + "T" + r.time) < new Date()).sort((a, b) => new Date(b.date + "T" + b.time) - new Date(a.date + "T" + a.time));

  function open(r) { setSelectedId(r.id); setJoinForm(BLANK); setJoinError(""); setJoinSuccess(false); setView("detail"); }

  return (
    <div style={S.app}>
      <style>{css}</style>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logoWrap}>
            <MBQBLogo size={44} color={C.cream} />
          </div>
          <button className="btn-gold" style={{ ...S.btn, fontSize: 13, padding: "9px 18px" }} onClick={() => { setRoundError(""); setRoundSuccess(false); setView("new"); }}>+ Nueva salida</button>
        </div>
      </div>

      {/* Hero banner */}
      <div style={{ background: C.green, padding: "28px 20px", textAlign: "center", borderBottom: `3px solid ${C.gold}` }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, color: C.gold, letterSpacing: 6, textTransform: "uppercase", marginBottom: 6 }}>Salidas de golf</div>
        <div style={{ fontFamily: "'Playfair Display', italic serif", fontStyle: "italic", fontSize: 16, color: "rgba(245,241,235,0.7)" }}>Organiza tu próxima ronda con el grupo</div>
      </div>

      <div style={S.main} className="fade-in">
        {upcoming.length === 0 && past.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}><MBQBLogo size={80} /></div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: C.green, marginBottom: 8 }}>No hay salidas programadas</div>
            <div style={{ fontSize: 14, color: C.muted, marginBottom: 32, fontStyle: "italic" }}>¡Organiza la primera salida del grupo!</div>
            <button className="btn-primary" style={{ ...S.btn, fontSize: 14, padding: "13px 28px" }} onClick={() => setView("new")}>+ Crear primera salida</button>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <div className="divider-ornament" style={{ marginBottom: 24 }}><span style={{ ...S.secLabel, marginBottom: 0 }}>Próximas salidas</span></div>
                {upcoming.map(r => {
                  const full = r.players.length >= r.maxPlayers;
                  return (
                    <div key={r.id} className="card-hover" style={S.card} onClick={() => open(r)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: C.green, lineHeight: 1.2 }}>{r.course}</div>
                        <StatusBadge count={r.players.length} max={r.maxPlayers} waitlist={r.waitlist.length} />
                      </div>
                      <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
                        📅 {formatDateShort(r.date)} &nbsp;·&nbsp; ⏰ {r.time} {r.status === "closed" ? "· 🔒" : ""}{r.lat ? " · 📍" : ""}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {r.players.map((p, i) => <span key={i} style={S.pill}>🏌️ {p.name.split(" ")[0]} <span style={{ opacity: 0.6, fontSize: 11 }}>HCP {hcpLabel(p.handicap)}</span>{p.transport === "offer" ? " 🚗" : p.transport === "need" ? " ✋" : ""}</span>)}
                        {!full && !r.status === "closed" && Array.from({ length: r.maxPlayers - r.players.length }).map((_, i) => <span key={i} style={S.pillEmpty}>+ cupo libre</span>)}
                        {r.waitlist.length > 0 && <span style={S.pillWait}>⏳ {r.waitlist.length} en espera</span>}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {past.length > 0 && (
              <>
                <div style={{ ...S.divider, marginTop: 36 }} />
                <div className="divider-ornament" style={{ marginBottom: 24 }}><span style={{ ...S.secLabel, marginBottom: 0, opacity: 0.5 }}>Historial</span></div>
                {past.map(r => (
                  <div key={r.id} className="card-hover" style={{ ...S.card, opacity: 0.5 }} onClick={() => open(r)}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: C.green }}>{r.course}</div>
                      <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Finalizada</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>📅 {formatDateShort(r.date)} · ⏰ {r.time} · {r.players.length} jugadores</div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
