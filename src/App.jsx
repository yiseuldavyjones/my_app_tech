import { useState, useEffect, useMemo } from "react";
import { FB_PROJECT_ID, FB_API_KEY, KAKAO_JS_KEY } from "./config";

const SAMPLE_DATA = [
  { id: "s1",  date:"2026-03-18", name:"SK하이닉스 수익",        amount:120000, received:true,  category:"주식"  },
  { id: "s2",  date:"2026-03-20", name:"스벅 아아 1잔",           amount:6500,   received:true,  category:"음료"  },
  { id: "s3",  date:"2026-03-20", name:"콜라겐토너패드",          amount:15000,  received:true,  category:"뷰티"  },
  { id: "s4",  date:"2026-03-20", name:"CU 3천원권",              amount:3000,   received:false, category:"편의점"},
  { id: "s5",  date:"2026-03-20", name:"맥날 감튀쿠폰",           amount:3500,   received:false, category:"외식"  },
  { id: "s6",  date:"2026-03-20", name:"메가커피 아아 2잔",       amount:8000,   received:true,  category:"음료"  },
  { id: "s7",  date:"2026-03-23", name:"트리트먼트 1500ml",       amount:12000,  received:true,  category:"뷰티"  },
  { id: "s8",  date:"2026-03-23", name:"씨유상품권 5천쿠",        amount:5000,   received:true,  category:"편의점"},
  { id: "s9",  date:"2026-03-24", name:"스벅 아아 1잔",           amount:6500,   received:true,  category:"음료"  },
  { id: "s10", date:"2026-03-24", name:"네페포 7천쿠",            amount:7000,   received:false, category:"외식"  },
  { id: "s11", date:"2026-03-24", name:"더벤티 아아 1잔",         amount:3500,   received:true,  category:"음료"  },
  { id: "s12", date:"2026-03-24", name:"씨유 5천쿠",              amount:5000,   received:true,  category:"편의점"},
  { id: "s13", date:"2026-03-24", name:"GS 아아 XL 250원",        amount:250,    received:true,  category:"음료"  },
  { id: "s14", date:"2026-03-24", name:"네페포 5천쿠",            amount:5000,   received:true,  category:"외식"  },
  { id: "s15", date:"2026-03-24", name:"메가커피 아아 3잔",       amount:12000,  received:true,  category:"음료"  },
  { id: "s16", date:"2026-03-26", name:"네페포 1천쿠",            amount:1000,   received:true,  category:"외식"  },
  { id: "s17", date:"2026-03-26", name:"쿠팡기프트카드 수익",     amount:120000, received:true,  category:"현금"  },
  { id: "s18", date:"2026-03-26", name:"메가커피 아아 2잔",       amount:8000,   received:true,  category:"음료"  },
  { id: "s19", date:"2026-03-26", name:"BHC 1만쿠 (5천에 구매)", amount:5000,   received:true,  category:"외식"  },
  { id: "s20", date:"2026-03-27", name:"스벅 아아 1잔",           amount:6500,   received:false, category:"음료"  },
  { id: "s21", date:"2026-03-27", name:"네페포 6천포",            amount:6000,   received:true,  category:"외식"  },
  { id: "s22", date:"2026-03-30", name:"컴포즈 1만원권",          amount:10000,  received:true,  category:"음료"  },
  { id: "s23", date:"2026-03-30", name:"네페포 5천포",            amount:5000,   received:true,  category:"외식"  },
  { id: "s24", date:"2026-03-30", name:"배민 5천쿠",              amount:5000,   received:false, category:"외식"  },
  { id: "s25", date:"2026-03-30", name:"화랑미술제 2매",          amount:20000,  received:false, category:"문화"  },
];

const CATEGORIES = ["전체","음료","외식","편의점","뷰티","현금","주식","문화","기타"];
const CAT_COLORS = { 음료:"#3b82f6", 외식:"#f59e0b", 편의점:"#10b981", 뷰티:"#ec4899", 현금:"#22c55e", 주식:"#ef4444", 문화:"#8b5cf6", 기타:"#6b7280" };
const CAT_ICONS  = { 음료:"☕", 외식:"🍜", 편의점:"🏪", 뷰티:"💄", 현금:"💵", 주식:"📈", 문화:"🎨", 기타:"🎁" };
const TABS = ["일","주","월","년","전체"];

const fmt  = n => n.toLocaleString("ko-KR")+"원";
const fmtD = d => d.replace(/-/g,".");

// ─── Firestore REST helpers ───────────────────────────────────────
const fsUrl = (col, docId="") => {
  const base = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT_ID}/databases/(default)/documents/${col}`;
  return docId ? `${base}/${docId}?key=${FB_API_KEY}` : `${base}?key=${FB_API_KEY}`;
};
const toDoc = item => ({ fields:{
  date:     { stringValue: item.date },
  name:     { stringValue: item.name },
  amount:   { integerValue: String(item.amount) },
  received: { booleanValue: item.received },
  category: { stringValue: item.category },
}});
const fromDoc = doc => ({
  id:       doc.name.split("/").pop(),
  date:     doc.fields.date.stringValue,
  name:     doc.fields.name.stringValue,
  amount:   parseInt(doc.fields.amount.integerValue || doc.fields.amount.doubleValue || 0),
  received: doc.fields.received.booleanValue,
  category: doc.fields.category.stringValue,
});

function LoginScreen({ onLogin }) {
  return (
    <div style={{ background:"#0f1117", minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🎁</div>
      <h1 style={{ color:"#fff", fontWeight:800, fontSize:26, margin:"0 0 8px" }}>나의 앱테크</h1>
      <p style={{ color:"#64748b", fontSize:14, marginBottom:48, textAlign:"center" }}>수익을 기록하고 관리해보세요</p>
      <button onClick={onLogin} style={{
        display:"flex", alignItems:"center", justifyContent:"center", gap:10,
        background:"#FEE500", color:"#191919",
        border:"none", borderRadius:14,
        padding:"15px 0", fontSize:16, fontWeight:700,
        cursor:"pointer", width:"100%", maxWidth:320,
        boxShadow:"0 4px 20px rgba(254,229,0,.25)"
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#191919">
          <path d="M12 3C6.477 3 2 6.477 2 11c0 2.89 1.582 5.448 4 7.02V21l3.047-2.032C11.013 19.313 11.5 19.36 12 19.36 17.523 19.36 22 15.884 22 11S17.523 3 12 3z"/>
        </svg>
        카카오로 로그인
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kakao_user")); }
    catch { return null; }
  });
  const [items,    setItems]    = useState([]);
  const [fbReady,  setFbReady]  = useState(false); // true after first fetch
  const [fbError,  setFbError]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("월");
  const [filterCat,setFilterCat]= useState("전체");
  const [filterRcv,setFilterRcv]= useState("전체");
  const [showAdd,  setShowAdd]  = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [toast, setToast] = useState(null); // { msg, type: "success"|"error" }
  const [viewDate, setViewDate] = useState(new Date("2026-03-30"));
  const [form, setForm] = useState({ date:"2026-03-30", name:"", amount:"", received:true, category:"음료" });
  const today = new Date("2026-03-30");

  // ── Kakao SDK 초기화 (v1 팝업 방식) ──────────────────────────
  useEffect(() => {
    if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(KAKAO_JS_KEY);
    }
  }, []);

  function kakaoLogin() {
    if (!window.Kakao?.isInitialized()) {
      alert("카카오 SDK가 아직 로드되지 않았어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    window.Kakao.Auth.login({
      success() {
        window.Kakao.API.request({
          url: "/v2/user/me",
          success(res) {
            const u = {
              id:         res.id,
              nickname:   res.kakao_account?.profile?.nickname ?? "사용자",
              profileImg: res.kakao_account?.profile?.thumbnail_image_url ?? null,
            };
            setUser(u);
            localStorage.setItem("kakao_user", JSON.stringify(u));
          },
          fail() { alert("사용자 정보를 가져오지 못했어요."); },
        });
      },
      fail(err) { alert("카카오 로그인 실패: " + JSON.stringify(err)); },
    });
  }

  function kakaoLogout() {
    if (window.Kakao?.Auth?.getAccessToken()) {
      window.Kakao.Auth.logout();
    }
    setUser(null);
    localStorage.removeItem("kakao_user");
  }

  function showToast(msg, type="success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  // ── Firebase CRUD ──────────────────────────────────────────────
  async function fetchAll() {
    setLoading(true); setFbError("");
    try {
      const res  = await fetch(fsUrl("apptech"));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Firestore 오류");
      const docs = json.documents || [];
      if (docs.length === 0 && !fbReady) {
        // 첫 연결 시 Firestore가 비어있으면 샘플 데이터 시드
        await seedSample();
      } else {
        setItems(docs.map(fromDoc));
        setFbReady(true);
      }
    } catch(e) {
      setFbError(e.message);
      setItems(SAMPLE_DATA); // fallback
    }
    setLoading(false);
  }

  async function seedSample() {
    try {
      await Promise.all(SAMPLE_DATA.map(item =>
        fetch(fsUrl("apptech"), {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify(toDoc(item))
        })
      ));
      await fetchAll();
    } catch(e) { setItems(SAMPLE_DATA); setLoading(false); }
  }

  async function addItem(item) {
    const res  = await fetch(fsUrl("apptech"), { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(toDoc(item)) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message);
    return json.name.split("/").pop();
  }
  async function updateItem(item) {
    const fields = ["date","name","amount","received","category"].map(f=>`updateMask.fieldPaths=${f}`).join("&");
    await fetch(`${fsUrl("apptech", item.id)}&${fields}`.replace("?key","?"+fields+"&key").replace(`?${fields}&key`, `?key`).replace("?key=", `?${fields}&key=`),
      { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(toDoc(item)) });
  }
  async function deleteItem(id) {
    await fetch(fsUrl("apptech", id), { method:"DELETE" });
  }

  useEffect(() => { fetchAll(); }, []);

  // ── Filtering ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...items];
    if (filterRcv==="수령")  list = list.filter(i=>i.received);
    if (filterRcv==="미수령") list = list.filter(i=>!i.received);
    if (filterCat!=="전체")  list = list.filter(i=>i.category===filterCat);
    const vd = viewDate;
    if (tab==="일") {
      const ds = vd.toISOString().slice(0,10);
      list = list.filter(i=>i.date===ds);
    } else if (tab==="주") {
      const dow = vd.getDay();
      const mon = new Date(vd); mon.setDate(vd.getDate()-(dow===0?6:dow-1));
      const sun = new Date(mon); sun.setDate(mon.getDate()+6);
      list = list.filter(i=>{ const d=new Date(i.date); return d>=mon&&d<=sun; });
    } else if (tab==="월") {
      list = list.filter(i=>i.date.startsWith(`${vd.getFullYear()}-${String(vd.getMonth()+1).padStart(2,"0")}`));
    } else if (tab==="년") {
      list = list.filter(i=>i.date.startsWith(String(vd.getFullYear())));
    }
    return list.sort((a,b)=>b.date.localeCompare(a.date));
  }, [items, tab, filterCat, filterRcv, viewDate]);

  const totalRcv  = filtered.filter(i=>i.received).reduce((s,i)=>s+i.amount,0);
  const totalPend = filtered.filter(i=>!i.received).reduce((s,i)=>s+i.amount,0);

  const catBreak = useMemo(()=>{
    const m={};
    filtered.filter(i=>i.received).forEach(i=>{ m[i.category]=(m[i.category]||0)+i.amount; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[filtered]);

  const grouped = useMemo(()=>{
    const m={};
    filtered.forEach(i=>{ (m[i.date]||(m[i.date]=[])).push(i); });
    return Object.entries(m).sort((a,b)=>b[0].localeCompare(a[0]));
  },[filtered]);

  function navLabel() {
    const vd=viewDate;
    if (tab==="일") return `${vd.getFullYear()}.${vd.getMonth()+1}.${vd.getDate()}`;
    if (tab==="주") {
      const dow=vd.getDay(), mon=new Date(vd); mon.setDate(vd.getDate()-(dow===0?6:dow-1));
      const sun=new Date(mon); sun.setDate(mon.getDate()+6);
      return `${mon.getMonth()+1}/${mon.getDate()} ~ ${sun.getMonth()+1}/${sun.getDate()}`;
    }
    if (tab==="월") return `${vd.getFullYear()}년 ${vd.getMonth()+1}월`;
    if (tab==="년") return `${vd.getFullYear()}년`;
    return "전체";
  }
  function navigate(dir) {
    const vd=new Date(viewDate);
    if (tab==="일") vd.setDate(vd.getDate()+dir);
    else if (tab==="주") vd.setDate(vd.getDate()+dir*7);
    else if (tab==="월") vd.setMonth(vd.getMonth()+dir);
    else if (tab==="년") vd.setFullYear(vd.getFullYear()+dir);
    setViewDate(vd);
  }

  async function handleSave() {
    if (!form.name || !form.amount) return;
    const item = { ...form, amount:parseInt(form.amount) };
    try {
      if (editItem) {
        item.id = editItem.id;
        await updateItem(item);
        setItems(prev=>prev.map(i=>i.id===item.id?item:i));
      } else {
        item.id = "tmp";
        const newId = await addItem(item);
        item.id = newId;
        setItems(prev=>[...prev, item]);
      }
    } catch(e) { alert("저장 실패: "+e.message); }
    showToast(editItem ? "수정이 완료됐어요! ✏️" : "수익이 등록됐어요! 🎉");
    setShowAdd(false); setEditItem(null);
    setForm({ date:today.toISOString().slice(0,10), name:"", amount:"", received:true, category:"음료" });
  }
  async function handleDelete(id) {
    if (!confirm("삭제하시겠어요?")) return;
    try { await deleteItem(id); } catch(e) {}
    setItems(prev=>prev.filter(i=>i.id!==id));
  }
  async function toggleRcv(item) {
    const u={...item,received:!item.received};
    try { await updateItem(u); } catch(e) {}
    setItems(prev=>prev.map(i=>i.id===item.id?u:i));
  }

  // ─── Styles ────────────────────────────────────────────────────
  const S = {
    app:    { background:"#0f1117", minHeight:"100vh", color:"#e2e8f0", fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif", paddingBottom:80 },
    hdr:    { background:"#1a1d27", borderBottom:"1px solid #2a2d3e", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 },
    hTitle: { fontSize:17, fontWeight:700, color:"#fff", margin:0 },
    tabs:   { display:"flex", background:"#1a1d27", borderBottom:"1px solid #2a2d3e", padding:"0 18px" },
    tab:  a => ({ padding:"11px 14px", border:"none", background:"none", color:a?"#6366f1":"#64748b", fontWeight:a?700:400, fontSize:14, cursor:"pointer", borderBottom:a?"2px solid #6366f1":"2px solid transparent" }),
    nav:    { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", background:"#1a1d27" },
    navBtn: { background:"#2a2d3e", border:"none", color:"#e2e8f0", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:16 },
    sum:    { margin:"14px 18px 0", background:"#1a1d27", borderRadius:16, padding:"18px" },
    filt:   { display:"flex", gap:7, padding:"10px 18px", overflowX:"auto" },
    fBtn: a => ({ padding:"5px 12px", borderRadius:20, border:"1px solid", borderColor:a?"#6366f1":"#2a2d3e", background:a?"#6366f1":"transparent", color:a?"#fff":"#94a3b8", fontSize:12, cursor:"pointer", whiteSpace:"nowrap", fontWeight:a?600:400 }),
    grp:    { margin:"0 18px 2px" },
    card:   { background:"#1a1d27", borderRadius:12, padding:"11px 13px", marginBottom:7, display:"flex", alignItems:"center", gap:11 },
    fab:    { position:"fixed", bottom:24, right:22, width:54, height:54, borderRadius:"50%", background:"#6366f1", border:"none", color:"#fff", fontSize:26, cursor:"pointer", boxShadow:"0 4px 24px rgba(99,102,241,.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
    modal:  { position:"fixed", inset:0, background:"rgba(0,0,0,.72)", zIndex:200, display:"flex", alignItems:"flex-end" },
    mBox:   { background:"#1a1d27", borderRadius:"20px 20px 0 0", padding:"24px 20px 44px", width:"100%", maxWidth:480, margin:"0 auto" },
    inp:    { width:"100%", background:"#0f1117", border:"1px solid #2a2d3e", borderRadius:10, padding:"10px 13px", color:"#e2e8f0", fontSize:14, marginBottom:13, boxSizing:"border-box" },
    sel:    { width:"100%", background:"#0f1117", border:"1px solid #2a2d3e", borderRadius:10, padding:"10px 13px", color:"#e2e8f0", fontSize:14, marginBottom:13, boxSizing:"border-box" },
    saveBtn:{ width:"100%", padding:"13px", background:"#6366f1", border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" },
    lbl:    { fontSize:12, color:"#94a3b8", marginBottom:5, display:"block" },
    tgl:    { display:"flex", gap:8, marginBottom:13 },
    tBtn: a => ({ flex:1, padding:9, borderRadius:10, border:"1px solid", borderColor:a?"#6366f1":"#2a2d3e", background:a?"#4f46e5":"transparent", color:a?"#fff":"#64748b", fontWeight:600, cursor:"pointer", fontSize:13 }),
    badge: r => ({ fontSize:10, padding:"2px 6px", borderRadius:10, background:r?"#14532d":"#451a03", color:r?"#4ade80":"#fbbf24", fontWeight:600 }),
    iconBtn:{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:13, padding:"2px 5px", borderRadius:6 },
  };

  if (!user) return <LoginScreen onLogin={kakaoLogin} />;

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.hdr}>
        <h1 style={S.hTitle}>나의 앱테크</h1>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {loading  && <span style={{ fontSize:11, color:"#f59e0b" }}>⏳ 로딩중</span>}
          {!loading && !fbError && <span style={{ fontSize:11, color:"#22c55e" }}>🔥 연결됨</span>}
          {fbError  && <span style={{ fontSize:11, color:"#ef4444", maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={fbError}>⚠️ {fbError}</span>}
          <button style={{ background:"#2a2d3e", border:"none", color:"#94a3b8", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12 }} onClick={fetchAll}>🔄</button>
          {user.profileImg
            ? <img src={user.profileImg} alt={user.nickname} style={{ width:26, height:26, borderRadius:"50%", objectFit:"cover" }} />
            : <span style={{ fontSize:13, color:"#e2e8f0", fontWeight:600 }}>{user.nickname}</span>
          }
          <button onClick={kakaoLogout} style={{ background:"#2a2d3e", border:"none", color:"#94a3b8", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:11 }}>로그아웃</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map(t=><button key={t} style={S.tab(tab===t)} onClick={()=>setTab(t)}>{t}</button>)}
      </div>

      {/* Date Nav */}
      {tab!=="전체" && (
        <div style={S.nav}>
          <button style={S.navBtn} onClick={()=>navigate(-1)}>‹</button>
          <span style={{ fontSize:15, fontWeight:600 }}>{navLabel()}</span>
          <button style={S.navBtn} onClick={()=>navigate(1)}>›</button>
        </div>
      )}

      {/* Summary */}
      <div style={S.sum}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <span style={{ fontSize:13, color:"#64748b" }}>✅ 수령 완료</span>
          <span style={{ fontSize:24, fontWeight:800, color:"#22c55e" }}>{fmt(totalRcv)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:10, borderTop:"1px solid #2a2d3e" }}>
          <span style={{ fontSize:13, color:"#f59e0b" }}>⏳ 미수령 대기</span>
          <span style={{ fontSize:16, fontWeight:700, color:"#f59e0b" }}>{fmt(totalPend)}</span>
        </div>
        {catBreak.length>0 && (
          <div style={{ marginTop:14 }}>
            {catBreak.map(([cat,amt])=>{
              const pct = totalRcv>0 ? Math.round(amt/totalRcv*100) : 0;
              const c = CAT_COLORS[cat]||"#6b7280";
              return (
                <div key={cat} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                  <div style={{ width:7,height:7,borderRadius:"50%",background:c,flexShrink:0 }}/>
                  <span style={{ fontSize:11,color:"#94a3b8",width:52,flexShrink:0 }}>{cat}</span>
                  <div style={{ flex:1,background:"#2a2d3e",borderRadius:4,height:5,overflow:"hidden" }}>
                    <div style={{ width:pct+"%",height:"100%",background:c,borderRadius:4,transition:"width .4s" }}/>
                  </div>
                  <span style={{ fontSize:11,color:"#e2e8f0",width:78,textAlign:"right",flexShrink:0 }}>{fmt(amt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={S.filt}>
        {["전체","수령","미수령"].map(f=>(
          <button key={f} style={S.fBtn(filterRcv===f)} onClick={()=>setFilterRcv(f)}>
            {f==="수령"?"✅ 수령":f==="미수령"?"⏳ 미수령":"전체"}
          </button>
        ))}
        <div style={{ width:1,background:"#2a2d3e",margin:"0 2px" }}/>
        {CATEGORIES.map(c=>(
          <button key={c} style={S.fBtn(filterCat===c)} onClick={()=>setFilterCat(c)}>{c}</button>
        ))}
      </div>

      {/* List */}
      {loading && <div style={{ textAlign:"center",color:"#64748b",padding:32 }}>🔥 Firebase에서 불러오는 중...</div>}
      {!loading && grouped.length===0 && <div style={{ textAlign:"center",color:"#64748b",padding:40 }}>항목이 없어요 🙂<br/><span style={{ fontSize:12 }}>+ 버튼으로 등록해보세요</span></div>}

      {grouped.map(([date, dayItems])=>(
        <div key={date} style={S.grp}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0 3px" }}>
            <span style={{ fontSize:12,color:"#64748b",fontWeight:600 }}>{fmtD(date)}</span>
            <span style={{ fontSize:12,color:"#6366f1",fontWeight:700 }}>{fmt(dayItems.filter(i=>i.received).reduce((s,i)=>s+i.amount,0))}</span>
          </div>
          {dayItems.map(item=>(
            <div key={item.id} style={S.card}>
              <div style={{ width:36,height:36,borderRadius:10,background:CAT_COLORS[item.category]||"#6b7280",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                {CAT_ICONS[item.category]||"🎁"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{item.name}</div>
                <div style={{ display:"flex",gap:5,alignItems:"center",marginTop:2 }}>
                  <span style={S.badge(item.received)}>{item.received?"✓ 수령":"□ 미수령"}</span>
                  <span style={{ fontSize:11,color:CAT_COLORS[item.category]||"#6b7280" }}>{item.category}</span>
                </div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0 }}>
                <span style={{ fontSize:15,fontWeight:700,color:item.received?"#22c55e":"#f59e0b" }}>{fmt(item.amount)}</span>
                <div style={{ display:"flex",gap:2 }}>
                  <button style={S.iconBtn} title={item.received?"수령 취소":"수령 완료"} onClick={()=>toggleRcv(item)}>{item.received?"↩":"✓"}</button>
                  <button style={S.iconBtn} onClick={()=>{ setEditItem(item); setForm({date:item.date,name:item.name,amount:String(item.amount),received:item.received,category:item.category}); setShowAdd(true); }}>✏️</button>
                  <button style={{ ...S.iconBtn,color:"#ef4444" }} onClick={()=>handleDelete(item.id)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* FAB */}
      <button style={S.fab} onClick={()=>{ setEditItem(null); setForm({date:today.toISOString().slice(0,10),name:"",amount:"",received:true,category:"음료"}); setShowAdd(true); }}>+</button>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", bottom:96, left:"50%", transform:"translateX(-50%)",
          background: toast.type==="success" ? "#22c55e" : "#ef4444",
          color:"#fff", borderRadius:14, padding:"13px 24px",
          fontSize:15, fontWeight:700, zIndex:999,
          boxShadow:"0 8px 32px rgba(0,0,0,.35)",
          display:"flex", alignItems:"center", gap:8,
          animation:"slideUp .3s ease",
          whiteSpace:"nowrap",
        }}>
          {toast.type==="success" ? "✅" : "❌"} {toast.msg}
        </div>
      )}
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(16px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div style={S.modal} onClick={e=>{ if(e.target===e.currentTarget){setShowAdd(false);setEditItem(null);} }}>
          <div style={S.mBox}>
            <div style={{ fontSize:17,fontWeight:700,marginBottom:18,color:"#fff" }}>{editItem?"✏️ 수정":"➕ 수익 등록"}</div>
            <label style={S.lbl}>날짜</label>
            <input type="date" style={S.inp} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
            <label style={S.lbl}>항목명</label>
            <input style={S.inp} placeholder="예: 스벅 아아 1잔" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
            <label style={S.lbl}>금액 (원)</label>
            <input type="number" style={S.inp} placeholder="예: 6500" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/>
            <label style={S.lbl}>카테고리</label>
            <select style={S.sel} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
              {CATEGORIES.filter(c=>c!=="전체").map(c=><option key={c}>{c}</option>)}
            </select>
            <label style={S.lbl}>수령 여부</label>
            <div style={S.tgl}>
              <button style={S.tBtn(form.received)}  onClick={()=>setForm({...form,received:true})}>✅ 수령 완료 (v)</button>
              <button style={S.tBtn(!form.received)} onClick={()=>setForm({...form,received:false})}>⏳ 미수령 (ㅁ)</button>
            </div>
            <button style={S.saveBtn} onClick={handleSave}>저장</button>
          </div>
        </div>
      )}
    </div>
  );
}
