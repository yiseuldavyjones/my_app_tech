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
const ZONES  = ["제일 안쪽", "중간 쪽", "바깥쪽", "입/출구 근처", "장애인 주차석", "기타"];
const COLORS = ["흰색", "검정", "회색", "은색", "빨강", "파랑", "노랑", "초록", "기타"];

// Upbit 팔레트
const C = {
  navy:    "#0d2050",
  blue:    "#1763b6",
  blueLt:  "#eef3fc",
  bg:      "#f5f6fa",
  border:  "#e2e6f0",
  text1:   "#1a1f36",
  text2:   "#6b7399",
  text3:   "#9ca3c5",
  white:   "#ffffff",
  red:     "#f04251",
  redLt:   "#fff0f1",
  green:   "#00a878",
  greenLt: "#e8faf4",
  orange:  "#f5a623",
  orangeLt:"#fff8ec",
};

const STATUS_INFO = {
  parked:      { label: "주차중",   color: C.blue,   bg: C.blueLt   },
  requested:   { label: "요청중",   color: C.orange, bg: C.orangeLt },
  moving:      { label: "이동중",   color: C.green,  bg: C.greenLt  },
  no_response: { label: "응답없음", color: C.red,    bg: C.redLt    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function maskCar(num = "") {
  if (num.length <= 4) return num;
  return "•".repeat(num.length - 4) + num.slice(-4);
}

const INP = {
  width: "100%", padding: "10px 14px",
  border: `1px solid ${C.border}`,
  borderRadius: 4, fontSize: 14,
  boxSizing: "border-box", background: C.white,
  color: C.text1, outline: "none",
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

  // ── Firebase ──────────────────────────────────────────────────────────────────

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
                  { fieldFilter: { field: { fieldPath: "status"        }, op: "EQUAL", value: { stringValue: "pending" } } },
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
    if (!form.carNumber.trim())  return showToast("차량번호를 입력해주세요", "error");
    if (!form.expectedLeaveTime) return showToast("출차 예정 시간을 입력해주세요", "error");
    setLoading(true);
    try {
      if (myParking) await fetch(fsUrl("parkings", myParking.id), { method: "DELETE" });
      const res = await fetch(fsUrl("parkings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toDoc({
          userId: user.id, nickname: user.nickname,
          profileImage: user.profileImage || "",
          carNumber: form.carNumber.trim(), carColor: form.carColor,
          carType: form.carType.trim(), location: form.location,
          expectedLeaveTime: form.expectedLeaveTime,
          status: "parked", lastRequesterId: "", lastRequesterNickname: "",
          createdAt: new Date().toISOString(),
        })),
      });
      if (!res.ok) throw new Error(res.status);
      showToast("차량이 등록되었습니다");
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
    if (parking.userId === user?.id)    return showToast("내 차량입니다", "error");
    if (parking.status === "moving")    return showToast("이미 이동 중입니다", "error");
    if (parking.status === "requested") return showToast("이미 요청이 전송된 차량입니다", "error");
    setLoading(true);
    try {
      await patchDoc("parkings", parking.id, {
        status: "requested", lastRequesterId: user.id, lastRequesterNickname: user.nickname,
      });
      const res = await fetch(fsUrl("requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toDoc({
          parkingId: parking.id, parkingUserId: parking.userId,
          requesterId: user.id, requesterNickname: user.nickname,
          status: "pending", createdAt: new Date().toISOString(),
        })),
      });
      if (!res.ok) throw new Error(res.status);
      showToast("요청을 보냈습니다. 응답을 기다려주세요");
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
          lastRequesterId: "", lastRequesterNickname: "",
        });
      }
      showToast(accept ? "수락했습니다. 차량을 이동해주세요" : "거절했습니다");
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
    return parkings.filter((p) =>
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
    <div style={{ minHeight: "100svh", background: C.bg, fontFamily: "'Noto Sans KR', system-ui, sans-serif", color: C.text1 }}>

      {/* ── Header (업비트 네이비) ── */}
      <header style={{ background: C.navy, padding: "0 16px" }}>
        <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={{ color: C.white, fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px" }}>파킹톡</span>
            <span style={{ color: "#8899bb", fontSize: 12, marginLeft: 8 }}>이중주차 도우미 앱</span>
          </div>
          {/* 알림 */}
          <button
            onClick={() => incomingReqs.length && setRespTarget(incomingReqs[0])}
            style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "6px 8px", color: "#8899bb", fontSize: 16 }}
          >
            🔔
            {incomingReqs.length > 0 && (
              <span style={{
                position: "absolute", top: 2, right: 2,
                background: C.red, color: C.white,
                borderRadius: "50%", width: 14, height: 14,
                fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {incomingReqs.length}
              </span>
            )}
          </button>
          {user.profileImage && (
            <img src={user.profileImage} alt="" style={{ width: 26, height: 26, borderRadius: "50%", border: `1px solid #3a4f7a` }} />
          )}
          <button
            onClick={kakaoLogout}
            style={{ background: "none", border: `1px solid #3a4f7a`, borderRadius: 3, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#8899bb" }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* ── 이동 요청 알림 배너 ── */}
      {incomingReqs.length > 0 && (
        <div style={{ background: "#fff8ec", borderBottom: `1px solid #fde2a0`, padding: "9px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#b05e00", fontWeight: 600 }}>
              ▲ {incomingReqs[0].requesterNickname}님이 차량 이동을 요청했습니다
            </span>
            <button
              onClick={() => setRespTarget(incomingReqs[0])}
              style={{ background: C.orange, color: C.white, border: "none", borderRadius: 3, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginLeft: 12 }}
            >
              응답하기
            </button>
          </div>
        </div>
      )}

      {/* ── 탭 ── */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex" }}>
          {[["list", "주차 현황"], ["mine", "내 차량"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: 1, padding: "14px 0", border: "none", background: "none", cursor: "pointer",
                fontSize: 13, fontWeight: tab === k ? 700 : 400,
                color: tab === k ? C.blue : C.text2,
                borderBottom: `2px solid ${tab === k ? C.blue : "transparent"}`,
                transition: "color .15s",
              }}
            >
              {label}
              {k === "mine" && myParking && (
                <span style={{ marginLeft: 5, background: C.blue, color: C.white, borderRadius: 2, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>등록</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── 컨텐츠 ── */}
      <div style={{ padding: "14px 14px 80px" }}>

        {/* 주차 현황 탭 */}
        {tab === "list" && (
          <>
            {/* 검색 */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.text3, fontSize: 14, pointerEvents: "none" }}>
             <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 15 15"><circle cx="7" cy="7" r="5.7" stroke="currentColor" stroke-width="1.4"></circle><path fill="currentColor" d="M13.505 14.495a.7.7 0 0 0 .99-.99L14 14zM10.5 10.5l-.495.495 3.5 3.5L14 14l.495-.495-3.5-3.5z"></path></svg>
              </span>
             
             
             
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="차량번호, 색상, 위치로 검색"
                style={{ ...INP, paddingLeft: 32 }}
              />
            </div>

            {/* 지수 박스 (업비트 스타일) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <IndexBox label="주차 차량" value={parkings.length} unit="대" color={C.blue} />
              <IndexBox label="이동 중" value={parkings.filter((p) => p.status === "moving").length} unit="대" color={C.green} />
            </div>

            {/* 리스트 헤더 */}
            <div style={{
              background: C.white, border: `1px solid ${C.border}`,
              borderBottom: "none", borderRadius: "4px 4px 0 0",
              padding: "8px 14px",
              display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr",
              gap: 8, fontSize: 11, color: C.text3, fontWeight: 600,
            }}>
              <span>차량번호 / 정보</span>
              <span>위치</span>
              <span>출차 예정</span>
              <span style={{ textAlign: "right" }}>상태</span>
            </div>

            {filtered.length === 0 ? (
              <div style={{
                background: C.white, border: `1px solid ${C.border}`,
                borderRadius: "0 0 4px 4px",
                textAlign: "center", padding: "48px 0", color: C.text3,
              }}>
                <div style={{ fontSize: 14 }}>
                  {parkings.length === 0 ? "등록된 차량이 없습니다" : "검색 결과가 없습니다"}
                </div>
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: "0 0 4px 4px", overflow: "hidden" }}>
                {filtered.map((p, i) => (
                  <ParkingRow
                    key={p.id}
                    parking={p}
                    userId={user.id}
                    onRequest={() => setReqTarget(p)}
                    isLast={i === filtered.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* 내 차량 탭 */}
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

      {/* ── 등록 FAB ── */}
      {!myParking && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, padding: "12px 14px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => setShowReg(true)}
            style={{
              width: "100%", padding: "13px 0",
              background: C.blue, color: C.white,
              border: "none", borderRadius: 4,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              letterSpacing: "-0.2px",
            }}
          >
            내 차량 등록하기
          </button>
        </div>
      )}

      {/* ── 차량 등록 모달 ── */}
      {showReg && (
        <Modal onClose={() => setShowReg(false)} title="내 차량 등록">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="차량번호 *">
              <input
                value={form.carNumber}
                onChange={(e) => setForm((f) => ({ ...f, carNumber: e.target.value }))}
                placeholder="예: 123가4567"
                style={INP}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="차량 색상">
                <select value={form.carColor} onChange={(e) => setForm((f) => ({ ...f, carColor: e.target.value }))} style={INP}>
                  {COLORS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="차종 (선택)">
                <input
                  value={form.carType}
                  onChange={(e) => setForm((f) => ({ ...f, carType: e.target.value }))}
                  placeholder="SUV, 세단..."
                  style={INP}
                />
              </Field>
            </div>
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
                width: "100%", padding: "13px 0",
                background: loading ? C.text3 : C.blue,
                color: C.white, border: "none", borderRadius: 4,
                fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4,
              }}
            >
              {loading ? "등록 중..." : "등록 완료"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 요청 확인 모달 ── */}
      {reqTarget && (
        <Modal onClose={() => setReqTarget(null)} title="이동 요청">
          <div style={{ padding: "8px 0" }}>
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: C.text2, marginBottom: 6 }}>요청 대상 차량</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text1, letterSpacing: 1 }}>{maskCar(reqTarget.carNumber)}</div>
              <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
                {reqTarget.carColor}{reqTarget.carType ? ` · ${reqTarget.carType}` : ""} &nbsp;|&nbsp; 📍 {reqTarget.location}
              </div>
              <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>차주: {reqTarget.nickname}</div>
            </div>
            <p style={{ fontSize: 13, color: C.text2, margin: "0 0 20px", textAlign: "center" }}>
              위 차량 소유자에게 이동 알림을 전송합니다.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setReqTarget(null)}
                style={{ flex: 1, padding: 12, border: `1px solid ${C.border}`, borderRadius: 4, background: C.white, fontSize: 14, cursor: "pointer", color: C.text2 }}
              >
                취소
              </button>
              <button
                onClick={() => sendRequest(reqTarget)}
                disabled={loading}
                style={{ flex: 2, padding: 12, background: loading ? C.text3 : C.blue, color: C.white, border: "none", borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                {loading ? "전송 중..." : "이동 요청 보내기"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 응답 모달 ── */}
      {respTarget && (
        <Modal onClose={() => setRespTarget(null)} title="이동 요청 수신">
          <div style={{ padding: "8px 0" }}>
            <div style={{ background: C.orangeLt, border: `1px solid #fde2a0`, borderRadius: 4, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#b05e00", fontWeight: 600 }}>
                ▲ {respTarget.requesterNickname}님이 차량 이동을 요청했습니다
              </div>
            </div>
            <p style={{ fontSize: 13, color: C.text2, margin: "0 0 20px", textAlign: "center" }}>
              어떻게 하시겠어요?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => respondToRequest(respTarget, false)}
                disabled={loading}
                style={{ flex: 1, padding: 12, border: `1px solid ${C.red}`, borderRadius: 4, background: C.white, fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.red }}
              >
                지금은 못 빼요
              </button>
              <button
                onClick={() => respondToRequest(respTarget, true)}
                disabled={loading}
                style={{ flex: 1, padding: 12, background: loading ? C.text3 : C.green, color: C.white, border: "none", borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                지금 빼러 갈게요
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "error" ? C.red : C.navy,
          color: C.white, padding: "10px 18px", borderRadius: 4,
          fontSize: 13, zIndex: 999, whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,.25)",
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
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", background: C.white }}>
      {/* 상단 네이비 영역 */}
      <div style={{ background: C.navy, padding: "56px 28px 48px", textAlign: "center" }}>
        <img src="/image.png" alt="" style={{ width: 72, height: 72, borderRadius: 16, marginBottom: 20, border: `2px solid #3a4f7a` }} />
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: C.white, letterSpacing: "-0.5px" }}>파킹톡</h1>
        <p style={{ color: "#8899bb", margin: 0, fontSize: 13 }}>이중주차 도우미 앱</p>
      </div>

      {/* 설명 카드 */}
      <div style={{ flex: 1, padding: "32px 24px" }}>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "20px 18px", marginBottom: 28 }}>
          {[
            ["🚗", "차량 등록", "주차 후 차량 정보와 출차 예정 시간을 등록하세요"],
            ["🔔", "이동 요청", "이중주차 시 차 빼기 요청을 1초 만에 전송"],
            ["✅", "빠른 응답", "수락/거절 응답이 즉시 요청자에게 전달됩니다"],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 20, lineHeight: 1.4 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onLogin}
          style={{
            width: "100%", padding: "14px 0",
            background: "#FEE500", color: "#191919",
            border: "none", borderRadius: 4,
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}></span>
          카카오로 시작하기
        </button>
      </div>
    </div>
  );
}

function IndexBox({ label, value, unit, color }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`,
      borderRadius: 4, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 12, color: C.text2 }}>{unit}</span>
      </div>
    </div>
  );
}

function ParkingRow({ parking, userId, onRequest, isLast }) {
  const st = STATUS_INFO[parking.status] || STATUS_INFO.parked;
  const isOwner    = parking.userId === userId;
  const iRequested = parking.lastRequesterId === userId;

  return (
    <div style={{
      background: C.white,
      borderBottom: isLast ? "none" : `1px solid ${C.border}`,
      padding: "12px 14px",
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr",
        gap: 8, alignItems: "center",
      }}>
        {/* 차량번호/정보 */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text1, letterSpacing: "0.5px" }}>
            {maskCar(parking.carNumber) || "-"}
          </div>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
            {parking.carColor}{parking.carType ? ` · ${parking.carType}` : ""}
          </div>
          <div style={{ fontSize: 11, color: C.text3 }}>{parking.nickname}</div>
        </div>
        {/* 위치 */}
        <div style={{ fontSize: 12, color: C.text2 }}>{parking.location}</div>
        {/* 출차 예정 */}
        <div style={{ fontSize: 12, color: C.text2 }}>
          {parking.expectedLeaveTime || "미정"}
        </div>
        {/* 상태 / 버튼 */}
        <div style={{ textAlign: "right" }}>
          {isOwner ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: C.blueLt, padding: "3px 8px", borderRadius: 2 }}>내 차량</span>
          ) : parking.status === "moving" ? (
            <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>이동 중</span>
          ) : iRequested ? (
            <span style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>대기 중</span>
          ) : parking.status === "requested" ? (
            <span style={{ fontSize: 11, color: C.text3 }}>처리 중</span>
          ) : (
            <button
              onClick={onRequest}
              style={{
                background: C.blue, color: C.white,
                border: "none", borderRadius: 3,
                padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
            >
              이동요청
            </button>
          )}
        </div>
      </div>
      {/* 상태 뱃지 */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 2,
          color: st.color, background: st.bg,
        }}>
          {st.label}
        </span>
      </div>
    </div>
  );
}

function MyTab({ myParking, loading, requests, onRegister, onLeave, onRespond }) {
  if (!myParking) {
    return (
      <div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: "36px 20px", textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text1, marginBottom: 8 }}>등록된 차량이 없습니다</div>
          <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.7 }}>
            주차 후 차량을 등록하면<br />이동 요청 알림을 받을 수 있습니다
          </div>
        </div>
        <button
          onClick={onRegister}
          style={{ width: "100%", padding: "13px 0", background: C.blue, color: C.white, border: "none", borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          내 차량 등록하기
        </button>
      </div>
    );
  }

  const st = STATUS_INFO[myParking.status] || STATUS_INFO.parked;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 요청 알림 */}
      {requests.length > 0 && (
        <div style={{ background: C.orangeLt, border: `1px solid #fde2a0`, borderRadius: 4, padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, color: "#b05e00", fontSize: 13, marginBottom: 10 }}>▲ 이동 요청이 도착했습니다</div>
          {requests.map((req) => (
            <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: C.text1 }}><b>{req.requesterNickname}</b>님의 요청</span>
              <button
                onClick={() => onRespond(req)}
                style={{ background: C.orange, color: C.white, border: "none", borderRadius: 3, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                응답하기
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 내 차량 카드 */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
        {/* 카드 헤더 */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.text2, fontWeight: 600 }}>내 차량 정보</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, padding: "2px 8px", borderRadius: 2 }}>
            {st.label}
          </span>
        </div>

        {/* 차량 상세 */}
        <div style={{ padding: "16px" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.text1, letterSpacing: 1, marginBottom: 4 }}>
            {myParking.carNumber}
          </div>
          <div style={{ fontSize: 13, color: C.text2, marginBottom: 16 }}>
            {myParking.carColor}{myParking.carType ? ` · ${myParking.carType}` : ""}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              ["주차 위치", myParking.location],
              ["출차 예정", myParking.expectedLeaveTime || "미정"],
            ].map(([label, val]) => (
              <div key={label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.text3, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text1 }}>{val}</div>
              </div>
            ))}
          </div>

          {myParking.status === "moving" && (
            <div style={{ background: C.greenLt, border: `1px solid #a7e9d5`, borderRadius: 4, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.green, fontWeight: 600 }}>
              ▲ 이동 중 — 5분 후 자동 출차 처리됩니다
            </div>
          )}

          <button
            onClick={onLeave}
            disabled={loading}
            style={{
              width: "100%", padding: 12,
              border: `1px solid ${C.red}`, borderRadius: 4,
              background: C.white, color: C.red,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "처리 중..." : "출차 완료 (등록 해제)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Modal({ onClose, title, children }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(13,32,80,.5)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div style={{ background: C.white, borderRadius: "12px 12px 0 0", padding: "20px 18px 28px", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text1 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.text3, lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
