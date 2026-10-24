// JOYLUCK CLUB API — Vercel Serverless Function (Node) + Upstash Redis (REST)
// 환경변수 이름에 접두사가 붙어 있어도(예: STORAGE_KV_REST_API_URL) 자동으로 찾습니다.
const pick = (re) => { const k = Object.keys(process.env).find((n) => re.test(n) && process.env[n]); return k ? process.env[k] : undefined; };
const crypto = require("crypto");
const URL_ = pick(/(^|_)(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/);
const TOK = pick(/(^|_)(KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)$/);
const CODE = (process.env.CLUB_CODE || "").trim();
const sameCode = (h) => { try { return decodeURIComponent(String(h || "")).trim() === CODE; } catch (_) { return false; } };

async function r(cmd) {
  const x = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOK }, body: JSON.stringify(cmd) });
  const j = await x.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function hall(k) {
  const a = (await r(["HGETALL", k])) || [];
  const vals = Array.isArray(a) ? a.filter((_, i) => i % 2 === 1) : Object.values(a);
  const out = [];
  for (const v of vals) { try { out.push(JSON.parse(v)); } catch (_) {} }
  return out;
}
const s = (v, n) => String(v == null ? "" : v).slice(0, n);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const imgIds = (a) => (Array.isArray(a) ? a.filter((x) => /^[a-f0-9]{24}$/.test(x)).slice(0, 3) : []);
const coverOk = (c) => (/^https:\/\//.test(s(c, 500)) ? s(c, 500) : "");
const dateOk = (d) => d === "" || /^\d{4}-\d{2}-\d{2}$/.test(d);

module.exports = async (req, res) => {
  if (req.method === "GET" && req.query && req.query.img) {
    const iid = String(req.query.img);
    if (!URL_ || !TOK || !/^[a-f0-9]{24}$/.test(iid)) return res.status(404).end();
    try {
      const d = await r(["HGET", "jl:imgs", iid]);
      if (!d) return res.status(404).end();
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(Buffer.from(String(d).split(",")[1], "base64"));
    } catch (_) {
      return res.status(500).end();
    }
  }
  res.setHeader("Cache-Control", "no-store");
  const missing = [!CODE && "CLUB_CODE", !URL_ && "Redis URL(KV_REST_API_URL)", !TOK && "Redis TOKEN(KV_REST_API_TOKEN)"].filter(Boolean);
  if (missing.length) return res.status(500).json({ error: "서버 설정이 필요해요: " + missing.join(", ") + " 이(가) 없어요. 설정 후 Redeploy 해주세요." });
  if (!sameCode(req.headers["x-club-code"])) return res.status(401).json({ error: "초대 코드가 맞지 않아요" });
  try {
    if (req.method === "GET" && req.query && req.query.q) {
      const key = (process.env.ALADIN_TTB_KEY || "").trim();
      if (!key) return res.status(501).json({ error: "noKey" });
      const u = "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?" + new URLSearchParams({
        ttbkey: key, Query: String(req.query.q).slice(0, 100), QueryType: "Keyword", MaxResults: "10", start: "1",
        SearchTarget: "Book", output: "js", Version: "20131101", Cover: "Big",
      });
      const x = await fetch(u);
      const t = (await x.text()).trim().replace(/;\s*$/, "");
      let j;
      try { j = JSON.parse(t); } catch (_) {
        try { j = JSON.parse(t.replace(/[\u0000-\u001f]/g, " ")); } catch (e2) { return res.status(502).json({ error: "알라딘 응답을 읽을 수 없어요" }); }
      }
      if (j.errorCode) return res.status(502).json({ error: "알라딘 오류: " + (j.errorMessage || j.errorCode) });
      const items = (j.item || []).map((i) => ({
        title: s(i.title, 200), author: s(i.author, 150), pub: s(i.publisher, 60), year: s(i.pubDate, 4),
        cover: String(i.cover || "").replace(/^http:/, "https:").slice(0, 500),
      }));
      return res.status(200).json({ items });
    }
    if (req.method === "GET") {
      const [books, entries, att, members] = await Promise.all(
        ["books", "entries", "att", "members"].map((k) => hall("jl:" + k))
      );
      return res.status(200).json({ books, entries, att, members });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "허용되지 않는 요청이에요" });
    const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const uid = s(b.uid, 40);
    if (!uid) return res.status(400).json({ error: "사용자 정보가 없어요" });
    let id = null;

    switch (b.op) {
      case "join": {
        const name = s(b.name, 20).trim();
        if (!name) return res.status(400).json({ error: "이름을 입력해 주세요" });
        await r(["HSET", "jl:members", uid, JSON.stringify({ uid, name, ts: Date.now() })]);
        break;
      }
      case "book": {
        const title = s(b.title, 200).trim();
        if (!title) return res.status(400).json({ error: "책 제목을 입력해 주세요" });
        const meetDate = s(b.meetDate, 10);
        if (!dateOk(meetDate)) return res.status(400).json({ error: "날짜 형식이 올바르지 않아요" });
        id = newId();
        await r(["HSET", "jl:books", id, JSON.stringify({
          id, title, author: s(b.author, 100), month: s(b.month, 7), meetDate,
          cover: coverOk(b.cover),
          place: s(b.place, 100), uid, ts: Date.now(),
        })]);
        break;
      }
      case "bedit": {
        const raw = await r(["HGET", "jl:books", s(b.id, 40)]);
        if (!raw) return res.status(404).json({ error: "책을 찾을 수 없어요" });
        const title = s(b.title, 200).trim();
        if (!title) return res.status(400).json({ error: "책 제목을 입력해 주세요" });
        const meetDate = s(b.meetDate, 10);
        if (!dateOk(meetDate)) return res.status(400).json({ error: "날짜 형식이 올바르지 않아요" });
        const bk = JSON.parse(raw);
        Object.assign(bk, { title, author: s(b.author, 100), month: s(b.month, 7), meetDate, place: s(b.place, 100), cover: coverOk(b.cover), edited: Date.now() });
        await r(["HSET", "jl:books", bk.id, JSON.stringify(bk)]);
        break;
      }
      case "bdel": {
        const raw = await r(["HGET", "jl:books", s(b.id, 40)]);
        if (!raw) break;
        const bk = JSON.parse(raw);
        if (bk.uid !== uid) return res.status(403).json({ error: "책을 등록한 사람만 삭제할 수 있어요" });
        for (const e of await hall("jl:entries")) {
          if (e.bookId !== bk.id) continue;
          for (const m of e.imgs || []) await r(["HDEL", "jl:imgs", m]);
          await r(["HDEL", "jl:entries", e.id]);
        }
        for (const a of await hall("jl:att")) if (a.bookId === bk.id) await r(["HDEL", "jl:att", a.bookId + "_" + a.uid]);
        await r(["HDEL", "jl:books", bk.id]);
        break;
      }
      case "sched": {
        const raw = await r(["HGET", "jl:books", s(b.id, 40)]);
        if (!raw) return res.status(404).json({ error: "책을 찾을 수 없어요" });
        const meetDate = s(b.meetDate, 10);
        if (!dateOk(meetDate)) return res.status(400).json({ error: "날짜 형식이 올바르지 않아요" });
        const bk = JSON.parse(raw);
        bk.meetDate = meetDate; bk.place = s(b.place, 100);
        await r(["HSET", "jl:books", bk.id, JSON.stringify(bk)]);
        break;
      }
      case "entry": {
        const type = b.type === "prompt" ? "prompt" : b.type === "review" ? "review" : null;
        const text = s(b.text, 5000).trim();
        if (!type || !text) return res.status(400).json({ error: "내용을 입력해 주세요" });
        if (!(await r(["HEXISTS", "jl:books", s(b.bookId, 40)]))) return res.status(404).json({ error: "책을 찾을 수 없어요" });
        const rating = type === "review" ? Math.min(5, Math.max(1, parseInt(b.rating, 10) || 5)) : null;
        id = newId();
        await r(["HSET", "jl:entries", id, JSON.stringify({ id, bookId: s(b.bookId, 40), type, text, rating, imgs: imgIds(b.imgs), uid, ts: Date.now() })]);
        break;
      }
      case "del": {
        const raw = await r(["HGET", "jl:entries", s(b.id, 40)]);
        if (!raw) break;
        const e0 = JSON.parse(raw);
        if (e0.uid !== uid) return res.status(403).json({ error: "내 글만 삭제할 수 있어요" });
        for (const m of e0.imgs || []) await r(["HDEL", "jl:imgs", m]);
        await r(["HDEL", "jl:entries", s(b.id, 40)]);
        break;
      }
      case "img": {
        const d = String(b.data || "");
        if (d.length > 650000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d))
          return res.status(400).json({ error: "사진 형식이나 크기가 올바르지 않아요" });
        id = crypto.randomBytes(12).toString("hex");
        await r(["HSET", "jl:imgs", id, d]);
        break;
      }
      case "edit": {
        const raw = await r(["HGET", "jl:entries", s(b.id, 40)]);
        if (!raw) return res.status(404).json({ error: "글을 찾을 수 없어요" });
        const e = JSON.parse(raw);
        if (e.uid !== uid) return res.status(403).json({ error: "내 글만 수정할 수 있어요" });
        const text = s(b.text, 5000).trim();
        if (!text) return res.status(400).json({ error: "내용을 입력해 주세요" });
        const imgs = imgIds(b.imgs);
        for (const old of e.imgs || []) if (!imgs.includes(old)) await r(["HDEL", "jl:imgs", old]);
        e.text = text; e.imgs = imgs; e.edited = Date.now();
        if (e.type === "review") e.rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || e.rating || 5));
        await r(["HSET", "jl:entries", e.id, JSON.stringify(e)]);
        break;
      }
      case "att": {
        const status = ["y", "m", "n"].includes(b.status) ? b.status : null;
        const bookId = s(b.bookId, 40);
        if (!status || !bookId) return res.status(400).json({ error: "잘못된 요청이에요" });
        await r(["HSET", "jl:att", bookId + "_" + uid, JSON.stringify({ bookId, uid, status })]);
        break;
      }
      default:
        return res.status(400).json({ error: "알 수 없는 요청이에요" });
    }
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    return res.status(500).json({ error: "서버 오류: " + e.message });
  }
};
