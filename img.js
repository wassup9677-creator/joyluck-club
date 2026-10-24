// 사진 제공 — /api/img?id=<24자리 id> (id는 추측하기 어려운 값)
const pick = (re) => { const k = Object.keys(process.env).find((n) => re.test(n) && process.env[n]); return k ? process.env[k] : undefined; };
const URL_ = pick(/(^|_)(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/);
const TOK = pick(/(^|_)(KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)$/);

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || "");
  if (!URL_ || !TOK || !/^[a-f0-9]{24}$/.test(id)) return res.status(404).end();
  try {
    const x = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOK }, body: JSON.stringify(["HGET", "jl:imgs", id]) });
    const d = (await x.json()).result;
    if (!d) return res.status(404).end();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(Buffer.from(d.split(",")[1], "base64"));
  } catch (_) {
    return res.status(500).end();
  }
};
