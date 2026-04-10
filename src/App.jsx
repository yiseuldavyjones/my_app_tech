import { useState, useEffect, useMemo, useRef } from "react";
import { FB_PROJECT_ID, FB_API_KEY, KAKAO_JS_KEY } from "./config";

// ─── Firestore REST helpers ───────────────────────────────────────────────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT_ID}/databases/(default)/documents`;

function fsUrl(col, id = "") {
  return `${FS_BASE}/${col}${id ? "/" + id : ""}?key=${FB_API_KEY}`;
}

function toDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (typeof v === "boolean")   fields[k] = { booleanValue: v };
    else if (typeof v === "number")    fields[k] = { integerValue: v };
    else                               fields[k] = { stringValue: String(v) };
  }
  return { fields };
}

function fromDoc(doc) {
  const obj = { id: doc.name?.split("/").pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if      ("stringValue"  in v) obj[k] = v.stringValue;
    else if ("integerValue" in v) obj[k] = Number(v.integerValue);
    else if ("booleanValue" in v) obj[k] = v.booleanValue;
    else                          obj[k] = null;
  }
  return obj;
}

async function patchDoc(col, id, fields) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  const res = await fetch(`${FS_BASE}/${col}/${id}?${mask}&key=${FB_API_KEY}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toDoc(fields)),
  });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ZONES  = ["A구역", "B구역", "C구역", "D구역", "출구 근처", "입구 근처", "기타"];
const COLORS = ["흰색", "검정", "회색", "은색", "빨강", "파랑", "노랑", "초록", "기타"];

const STATUS_INFO = {
  parked:      { label: "주차중",   color: "#3b82f6", bg: "#eff6ff" },
  requested:   { label: "요청중",   color: "#f59e0b", bg: "#fef3c7" },
  moving:      { label: "이동중",   color: "#16a34a", bg: "#f0fdf4" },
  no_response: { label: "응답없음", color: "#ef4444", bg: "#fef2f2" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function maskCar(num = "") {
  if (num.length <= 4) return num;
  return "•".repeat(num.length - 4) + num.slice(-4);
}

const INP = {
  width: "100%", padding: "10px 14px", border: "1px solid #e5e7eb",
  borderRadius: 10, fontSize: 15, boxSizing: "border-box", background: "#fff",
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pk_user")); } catch { return null; }
  });
  const [parkings,     setParkings]     = useState([]);
  const [myParking,    setMyParking]    = useState(null);
  const [incomingReqs, setIncomingReqs] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("list");
  const [search,   setSearch]   = useState("");
  const [showReg,  setShowReg]  = useState(false);
  const [reqTarget,  setReqTarget]  = useState(null);
  const [respTarget, setRespTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    carNumber: "", carColor: "흰색", carType: "",
    location: "A구역", expectedLeaveTime: "",
  });

  const intervalRef = useRef(null);
  const userRef     = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Firebase ─────────────────────────────────────────────────────────────────

  async function fetchParkings() {
    try {
      const res = await fetch(fsUrl("parkings"));
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const docs = (data.documents || []).map(fromDoc);
      setParkings(docs);
      return docs;
    } catch { return []; }
  }

  async function fetchRequests(uid) {
    if (!uid) return [];
    try {
      const res = await fetch(`${FS_BASE}:runQuery?key=${FB_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "requests" }],
            where: {
              compositeFilter: {
                op: "AND",
                filters: [
                  { fieldFilter: { field: { fieldPath: "parkingUserId" }, op: "EQUAL", value: { stringValue: uid } } },
                  { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending" } } },
                ],
              },
            },
          },
        }),
      });
      const data = await res.json();
      return (Array.isArray(data) ? data : [])
        .filter((d) => d.document)
        .map((d) => fromDoc(d.document));
    } catch { return []; }
  }

  async function poll(u = userRef.current) {
    const docs = await fetchParkings();
    if (u) {
      const mine = docs.find((p) => p.userId === u.id);
      setMyParking(mine || null);
      const reqs = await fetchRequests(u.id);
      setIncomingReqs(reqs);
    }
  }

  async function registerParking() {
    if (!form.carNumber.trim())    return showToast("차량번호를 입력해주세요", "error");
    if (!form.expectedLeaveTime)   return showToast("출차 예정 시간을 입력해주세요", "error");
    setLoading(true);
    try {
      if (myParking) await fetch(fsUrl("parkings", myParking.id), { method: "DELETE" });
      const res = await fetch(fsUrl("parkings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toDoc({
          userId:             user.id,
          nickname:           user.nickname,
          profileImage:       user.profileImage || "",
          carNumber:          form.carNumber.trim(),
          carColor:           form.carColor,
          carType:            form.carType.trim(),
          location:           form.location,
          expectedLeaveTime:  form.expectedLeaveTime,
          status:             "parked",
          lastRequesterId:    "",
          lastRequesterNickname: "",
          createdAt:          new Date().toISOString(),
        })),
      });
      if (!res.ok) throw new Error(res.status);
      showToast("차량이 등록되었습니다 ✓");
      setShowReg(false);
      setForm({ carNumber: "", carColor: "흰색", carType: "", location: "A구역", expectedLeaveTime: "" });
      await poll();
    } catch (e) { showToast("등록 실패: " + e.message, "error"); }
    finally { setLoading(false); }
  }

  async function leaveParking() {
    if (!myParking) return;
    setLoading(true);
    try {
      await fetch(fsUrl("parkings", myParking.id), { method: "DELETE" });
      setMyParking(null);
      showToast("출차 완료되었습니다");
      await poll();
    } catch { showToast("오류가 발생했습니다", "error"); }
    finally { setLoading(false); }
  }

  async function sendRequest(parking) {
    if (parking.userId === user?.id)     return showToast("내 차량입니다", "error");
    if (parking.status === "moving")     return showToast("이미 이동 중입니다", "error");
    if (parking.status === "requested")  return showToast("이미 요청이 전송된 차량입니다", "error");
    setLoading(true);
    try {
      await patchDoc("parkings", parking.id, {
        status: "requested",
        lastRequesterId: user.id,
        lastRequesterNickname: user.nickname,
      });
      const res = await fetch(fsUrl("requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toDoc({
          parkingId:          parking.id,
          parkingUserId:      parking.userId,
          requesterId:        user.id,
          requesterNickname:  user.nickname,
          status:             "pending",
          createdAt:          new Date().toISOString(),
        })),
      });
      if (!res.ok) throw new Error(res.status);
      showToast("요청을 보냈습니다! 응답을 기다려주세요 🔔");
      setReqTarget(null);
      await poll();
    } catch { showToast("요청 전송 실패", "error"); }
    finally { setLoading(false); }
  }

  async function respondToRequest(req, accept) {
    setLoading(true);
    try {
      await patchDoc("requests", req.id, {
        status: accept ? "accepted" : "declined",
        respondedAt: new Date().toISOString(),
      });
      if (myParking) {
        await patchDoc("parkings", myParking.id, {
          status: accept ? "moving" : "parked",
          lastRequesterId: "",
          lastRequesterNickname: "",
        });
      }
      showToast(accept ? "수락했습니다. 차량을 이동해주세요 🚗" : "거절했습니다");
      setRespTarget(null);
      setIncomingReqs((prev) => prev.filter((r) => r.id !== req.id));
      await poll();
      if (accept && myParking) {
        const pid = myParking.id;
        setTimeout(async () => {
          await fetch(fsUrl("parkings", pid), { method: "DELETE" });
          await poll();
        }, 5 * 60 * 1000);
      }
    } catch { showToast("오류가 발생했습니다", "error"); }
    finally { setLoading(false); }
  }

  // ── Kakao ─────────────────────────────────────────────────────────────────────

  function kakaoLogin() {
    if (!window.Kakao?.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
    window.Kakao.Auth.login({
      success: () => {
        window.Kakao.API.request({
          url: "/v2/user/me",
          success: (res) => {
            const u = {
              id: String(res.id),
              nickname: res.kakao_account?.profile?.nickname || "익명",
              profileImage: res.kakao_account?.profile?.thumbnail_image_url || "",
            };
            setUser(u);
            localStorage.setItem("pk_user", JSON.stringify(u));
          },
        });
      },
      fail: () => showToast("로그인 실패", "error"),
    });
  }

  function kakaoLogout() {
    if (window.Kakao?.Auth?.getAccessToken()) window.Kakao.Auth.logout();
    setUser(null);
    setMyParking(null);
    localStorage.removeItem("pk_user");
  }

  // ── Effects ───────────────────────────────────────────────────────────────────

  useEffect(() => { poll(); }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!user) return;
    const u = user;
    intervalRef.current = setInterval(() => poll(u), 10000);
    return () => clearInterval(intervalRef.current);
  }, [user]); // eslint-disable-line

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search) return parkings;
    const q = search.toLowerCase();
    return parkings.filter(
      (p) =>
        p.carNumber?.toLowerCase().includes(q) ||
        p.carColor?.includes(q) ||
        p.carType?.toLowerCase().includes(q) ||
        p.location?.includes(q) ||
        p.nickname?.includes(q)
    );
  }, [parkings, search]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!user) return <LoginScreen onLogin={kakaoLogin} />;

  return (
    <div style={{ minHeight: "100svh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Header ── */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/image.png" alt="" style={{ width: 34, height: 34, borderRadius: 10 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#1e293b", lineHeight: 1.2 }}>파킹톡</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>영덕레스피아 주차장</div>
          </div>
          {/* Bell */}
          <button
            onClick={() => incomingReqs.length && setRespTarget(incomingReqs[0])}
            style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 6, fontSize: 20, lineHeight: 1 }}
          >
            🔔
            {incomingReqs.length > 0 && (
              <span style={{
                position: "absolute", top: 2, right: 2, background: "#ef4444", color: "#fff",
                borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {incomingReqs.length}
              </span>
            )}
          </button>
          {user.profileImage && (
            <img src={user.profileImage} alt="" style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #e5e7eb" }} />
          )}
          <button
            onClick={kakaoLogout}
            style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "#64748b" }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* ── Incoming request banner ── */}
      {incomingReqs.length > 0 && (
        <div style={{ background: "#fef3c7", borderBottom: "1px solid #fde68a", padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, color: "#92400e", fontWeight: 600 }}>
              🔔 {incomingReqs[0].requesterNickname}님이 차량 이동을 요청했습니다
            </span>
            <button
              onClick={() => setRespTarget(incomingReqs[0])}
              style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", marginLeft: 10 }}
            >
              응답하기
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex" }}>
          {[["list", "주차 현황"], ["mine", "내 차량"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: 1, padding: "13px 0", border: "none", background: "none", cursor: "pointer",
                fontSize: 14, fontWeight: tab === k ? 700 : 400,
                color: tab === k ? "#3b82f6" : "#64748b",
                borderBottom: `2px solid ${tab === k ? "#3b82f6" : "transparent"}`,
              }}
            >
              {label}
              {k === "mine" && myParking && (
                <span style={{ marginLeft: 6, background: "#3b82f6", color: "#fff", borderRadius: 10, fontSize: 11, padding: "1px 6px" }}>등록</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: 16 }}>

        {tab === "list" && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="차량번호, 색상, 위치로 검색..."
              style={{ ...INP, marginBottom: 14 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <StatBox label="주차 차량" value={parkings.length}                                   color="#3b82f6" bg="#eff6ff" />
              <StatBox label="이동 중"   value={parkings.filter((p) => p.status === "moving").length} color="#16a34a" bg="#f0fdf4" />
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "52px 0", color: "#94a3b8" }}>
                <div style={{ fontSize: 52 }}>🚗</div>
                <div style={{ marginTop: 12, fontSize: 15 }}>
                  {parkings.length === 0 ? "등록된 차량이 없습니다" : "검색 결과가 없습니다"}
                </div>
                {parkings.length === 0 && (
                  <div style={{ fontSize: 13, marginTop: 6, color: "#cbd5e1" }}>주차 후 아래 버튼으로 차량을 등록하세요</div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map((p) => (
                  <ParkingCard
                    key={p.id}
                    parking={p}
                    userId={user.id}
                    onRequest={() => setReqTarget(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "mine" && (
          <MyTab
            myParking={myParking}
            loading={loading}
            requests={incomingReqs}
            onRegister={() => setShowReg(true)}
            onLeave={leaveParking}
            onRespond={setRespTarget}
          />
        )}
      </div>

      {/* ── FAB ── */}
      {!myParking && (
        <button
          onClick={() => setShowReg(true)}
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff",
            border: "none", borderRadius: 24, padding: "14px 28px",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(59,130,246,.4)", whiteSpace: "nowrap",
          }}
        >
          🚗 내 차량 등록하기
        </button>
      )}

      {/* ── Register Modal ── */}
      {showReg && (
        <Modal onClose={() => setShowReg(false)} title="내 차량 등록">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="차량번호 *">
              <input
                value={form.carNumber}
                onChange={(e) => setForm((f) => ({ ...f, carNumber: e.target.value }))}
                placeholder="예: 123가4567"
                style={INP}
              />
            </Field>
            <Field label="차량 색상">
              <select value={form.carColor} onChange={(e) => setForm((f) => ({ ...f, carColor: e.target.value }))} style={INP}>
                {COLORS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="차종 (선택)">
              <input
                value={form.carType}
                onChange={(e) => setForm((f) => ({ ...f, carType: e.target.value }))}
                placeholder="예: SUV, 세단, 트럭..."
                style={INP}
              />
            </Field>
            <Field label="주차 위치">
              <select value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={INP}>
                {ZONES.map((z) => <option key={z}>{z}</option>)}
              </select>
            </Field>
            <Field label="출차 예정 시간 *">
              <input
                type="time"
                value={form.expectedLeaveTime}
                onChange={(e) => setForm((f) => ({ ...f, expectedLeaveTime: e.target.value }))}
                style={INP}
              />
            </Field>
            <button
              onClick={registerParking}
              disabled={loading}
              style={{
                background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff",
                border: "none", borderRadius: 12, padding: 14,
                fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 4,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "등록 중..." : "등록 완료"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Request Confirm Modal ── */}
      {reqTarget && (
        <Modal onClose={() => setReqTarget(null)} title="이동 요청">
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>🚗</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              {maskCar(reqTarget.carNumber)} 차량에 이동 요청
            </div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 4 }}>위치: {reqTarget.location}</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>
              {reqTarget.nickname}님에게 알림을 보냅니다
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setReqTarget(null)}
                style={{ flex: 1, padding: 13, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", fontSize: 15, cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={() => sendRequest(reqTarget)}
                disabled={loading}
                style={{
                  flex: 1, padding: 13, background: "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: "#fff", border: "none", borderRadius: 12,
                  fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "전송 중..." : "요청 보내기"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Response Modal ── */}
      {respTarget && (
        <Modal onClose={() => setRespTarget(null)} title="이동 요청 도착">
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>🔔</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
              {respTarget.requesterNickname}님이<br />차량 이동을 요청했습니다
            </div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>어떻게 하시겠어요?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => respondToRequest(respTarget, false)}
                disabled={loading}
                style={{
                  flex: 1, padding: 13, border: "2px solid #ef4444", borderRadius: 12,
                  background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#ef4444",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                지금은 못 빼요
              </button>
              <button
                onClick={() => respondToRequest(respTarget, true)}
                disabled={loading}
                style={{
                  flex: 1, padding: 13, background: "linear-gradient(135deg,#16a34a,#15803d)",
                  color: "#fff", border: "none", borderRadius: 12,
                  fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1,
                }}
              >
                지금 빼러 갈게요!
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "error" ? "#ef4444" : "#1e293b",
          color: "#fff", padding: "12px 20px", borderRadius: 12,
          fontSize: 14, zIndex: 999, whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,.2)",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  return (
    <div style={{
      minHeight: "100svh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#f8fafc", padding: 24, textAlign: "center",
    }}>
      <img
        src="/image.png"
        alt=""
        style={{ width: 90, height: 90, borderRadius: 24, marginBottom: 22, boxShadow: "0 8px 24px rgba(59,130,246,.2)" }}
      />
      <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 8px", color: "#1e293b" }}>파킹톡</h1>
      <p style={{ color: "#64748b", margin: "0 0 6px", fontSize: 15 }}>영덕레스피아 공원 주차장</p>
      <p style={{ color: "#94a3b8", margin: "0 0 44px", fontSize: 13, lineHeight: 1.7 }}>
        전화 없이 빠르게 차 이동 요청<br />이중주차 문제를 쉽게 해결하세요
      </p>
      <button
        onClick={onLogin}
        style={{
          background: "#FEE500", color: "#191919", border: "none", borderRadius: 14,
          padding: "15px 36px", fontSize: 16, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 4px 14px rgba(254,229,0,.5)",
        }}
      >
        <span style={{ fontSize: 22 }}>💬</span>
        카카오로 시작하기
      </button>
      <p style={{ marginTop: 20, fontSize: 12, color: "#cbd5e1" }}>
        로그인 시 차량 등록 및 요청 기능이 활성화됩니다
      </p>
    </div>
  );
}

function StatBox({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: 14, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ParkingCard({ parking, userId, onRequest }) {
  const st = STATUS_INFO[parking.status] || STATUS_INFO.parked;
  const isOwner     = parking.userId === userId;
  const iRequested  = parking.lastRequesterId === userId;

  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: 16,
      boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f1f5f9",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b", letterSpacing: 1 }}>
            {maskCar(parking.carNumber) || "번호 미등록"}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {parking.carColor}{parking.carType ? ` · ${parking.carType}` : ""}
          </div>
        </div>
        <span style={{
          background: st.bg, color: st.color,
          fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
          whiteSpace: "nowrap",
        }}>
          {st.label}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "#475569" }}>📍 {parking.location}</span>
        <span style={{ fontSize: 13, color: "#475569" }}>
          🕐 {parking.expectedLeaveTime ? `${parking.expectedLeaveTime} 출차 예정` : "출차 시간 미정"}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{parking.nickname}</span>
        {isOwner ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "#eff6ff", padding: "4px 10px", borderRadius: 20 }}>
            내 차량
          </span>
        ) : parking.status === "moving" ? (
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>이동 중...</span>
        ) : iRequested ? (
          <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>응답 대기 중...</span>
        ) : parking.status === "requested" ? (
          <span style={{ fontSize: 13, color: "#94a3b8" }}>다른 요청 처리 중</span>
        ) : (
          <button
            onClick={onRequest}
            style={{
              background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff",
              border: "none", borderRadius: 10, padding: "8px 14px",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            차 빼기 요청
          </button>
        )}
      </div>
    </div>
  );
}

function MyTab({ myParking, loading, requests, onRegister, onLeave, onRespond }) {
  if (!myParking) {
    return (
      <div style={{ textAlign: "center", padding: "56px 16px" }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🅿️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
          차량이 등록되지 않았습니다
        </div>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 32, lineHeight: 1.7 }}>
          주차 후 차량을 등록하면<br />이동 요청 알림을 받을 수 있어요
        </div>
        <button
          onClick={onRegister}
          style={{
            background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff",
            border: "none", borderRadius: 14, padding: "14px 30px",
            fontSize: 16, fontWeight: 700, cursor: "pointer",
          }}
        >
          🚗 차량 등록하기
        </button>
      </div>
    );
  }

  const st = STATUS_INFO[myParking.status] || STATUS_INFO.parked;

  return (
    <div>
      {requests.length > 0 && (
        <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 10 }}>🔔 이동 요청이 도착했습니다</div>
          {requests.map((req) => (
            <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14 }}><strong>{req.requesterNickname}</strong>님의 요청</div>
              <button
                onClick={() => onRespond(req)}
                style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                응답하기
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>내 차량 정보</div>
          <span style={{ background: st.bg, color: st.color, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20 }}>
            {st.label}
          </span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#1e293b", letterSpacing: 1, marginBottom: 4 }}>
          {myParking.carNumber}
        </div>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 18 }}>
          {myParking.carColor}{myParking.carType ? ` · ${myParking.carType}` : ""}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <InfoBox label="주차 위치" value={`📍 ${myParking.location}`} />
          <InfoBox label="출차 예정" value={`🕐 ${myParking.expectedLeaveTime || "미정"}`} />
        </div>
        {myParking.status === "moving" && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 14, color: "#15803d", textAlign: "center", fontWeight: 600 }}>
            🚗 이동 중 — 5분 후 자동 출차 처리됩니다
          </div>
        )}
        <button
          onClick={onLeave}
          disabled={loading}
          style={{
            width: "100%", padding: 14, border: "2px solid #ef4444", borderRadius: 12,
            background: "#fff", color: "#ef4444", fontSize: 15, fontWeight: 700,
            cursor: "pointer", opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "처리 중..." : "✅ 출차 완료 (등록 해제)"}
        </button>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{value}</div>
    </div>
  );
}

function Modal({ onClose, title, children }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
