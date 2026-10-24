// JOYLUCK CLUB API — Vercel Serverless Function (Node) + Upstash Redis (REST)
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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
const dateOk = (d) => d === "" || /^\d{4}-\d{2}-\d{2}$/.test(d);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOK || !process.env.CLUB_CODE)
    return res.status(500).json({ error: "서버 설정이 필요해요 (CLUB_CODE, Redis 연결)" });
  if (req.headers["x-club-code"] !== process.env.CLUB_CODE)
    return res.status(401).json({ error: "초대 코드가 맞지 않아요" });
  try {
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
          place: s(b.place, 100), uid, ts: Date.now(),
        })]);
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
        await r(["HSET", "jl:entries", id, JSON.stringify({ id, bookId: s(b.bookId, 40), type, text, rating, uid, ts: Date.now() })]);
        break;
      }
      case "del": {
        const raw = await r(["HGET", "jl:entries", s(b.id, 40)]);
        if (!raw) break;
        if (JSON.parse(raw).uid !== uid) return res.status(403).json({ error: "내 글만 삭제할 수 있어요" });
        await r(["HDEL", "jl:entries", s(b.id, 40)]);
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
