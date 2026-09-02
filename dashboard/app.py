import os
import re
import json
import hashlib
import requests
import concurrent.futures
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, redirect, request, session, render_template, jsonify, url_for, send_file

from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "goquadros-dashboard-2026")

CLIENT_ID = os.getenv("ML_CLIENT_ID")
CLIENT_SECRET = os.getenv("ML_CLIENT_SECRET")
REDIRECT_URI = os.getenv("ML_REDIRECT_URI")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
TOKENS_FILE = os.path.join(DATA_DIR, "tokens.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
CLIPS_FILE = os.path.join(DATA_DIR, "clips.json")
KEYWORDS_FILE = os.path.join(DATA_DIR, "keywords.json")
ADS_CONFIG_FILE = os.path.join(DATA_DIR, "ads_config.json")
SALES_HISTORY_FILE = os.path.join(DATA_DIR, "sales_history.json")

ACCOUNTS = {
    "freewall": {
        "platform": "ml", "name": "Freewall Decoração", "moldura": "Caixinha",
        "token": None, "refresh_token": None, "seller_id": None,
    },
    "nova_gq": {
        "platform": "ml", "name": "GQ Decoração", "moldura": "Filete",
        "token": None, "refresh_token": None, "seller_id": None,
    },
}

COR_PALAVRAS = [
    "marrom-escuro", "marrom-claro", "marrom", "preto", "branco", "off white",
    "nogueira", "freijó", "freijo", "cinza", "dourado", "prata", "natural",
]

def extract_cor(text):
    t = (text or "").lower()
    for palavra in COR_PALAVRAS:
        if palavra in t:
            return palavra
    return "—"

COR_MAP = {
    "marrom":        "Nogueira",
    "marrom-escuro": "Nogueira",
    "marrom-claro":  "Freijó",
}

def normalize_cor(cor):
    if not cor or cor == "—":
        return "—"
    return COR_MAP.get(cor.lower(), cor)


# ── Users ──────────────────────────────────────────────────────────────────

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE) as f:
            return json.load(f)
    # Create default master user on first run
    users = {
        "admin": {
            "password": hash_pw("goquadros2026"),
            "name": "Administrador",
            "role": "master",
        }
    }
    save_users(users)
    return users

def save_users(users):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated

def master_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user"):
            return redirect(url_for("login"))
        users = load_users()
        if users.get(session["user"], {}).get("role") != "master":
            return jsonify({"error": "Acesso negado"}), 403
        return f(*args, **kwargs)
    return decorated


# ── ML Tokens ──────────────────────────────────────────────────────────────

def save_tokens():
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(TOKENS_FILE, "w") as f:
        json.dump(ACCOUNTS, f)

def load_tokens():
    if os.path.exists(TOKENS_FILE):
        with open(TOKENS_FILE) as f:
            data = json.load(f)
            for k, v in data.items():
                if k in ACCOUNTS:
                    # preserva campos hardcoded (nome, moldura, credenciais) do codigo/.env
                    preserved = {
                        field: ACCOUNTS[k][field]
                        for field in ("name", "moldura")
                        if field in ACCOUNTS[k]
                    }
                    ACCOUNTS[k].update(v)
                    ACCOUNTS[k].update(preserved)

def refresh_token(account_key):
    acc = ACCOUNTS[account_key]
    if not acc.get("refresh_token"):
        return False
    r = requests.post("https://api.mercadolibre.com/oauth/token", data={
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": acc["refresh_token"],
    })
    if r.status_code == 200:
        d = r.json()
        acc["token"] = d["access_token"]
        acc["refresh_token"] = d.get("refresh_token", acc["refresh_token"])
        save_tokens()
        return True
    return False

def ml_get(account_key, path, params=None):
    acc = ACCOUNTS[account_key]
    if not acc.get("token"):
        return None
    headers = {"Authorization": f"Bearer {acc['token']}"}
    r = requests.get(f"https://api.mercadolibre.com{path}", headers=headers, params=params, timeout=8)
    if r.status_code == 401:
        if refresh_token(account_key):
            headers = {"Authorization": f"Bearer {ACCOUNTS[account_key]['token']}"}
            r = requests.get(f"https://api.mercadolibre.com{path}", headers=headers, params=params, timeout=8)
    if r.status_code == 200:
        return r.json()
    return None


# ── Orders logic ───────────────────────────────────────────────────────────

def pick_attr(attrs, *keys):
    for k in keys:
        v = attrs.get(k.lower())
        if v and v != "—":
            return v
    return "—"

def extract_from_title(title):
    t = title or ""
    tamanho = re.search(r'\d{2,3}[xX]\d{2,3}', t)
    if re.search(r'sem\s+vidro', t, re.IGNORECASE):
        acabamento = "Sem Vidro"
    elif re.search(r'vidro', t, re.IGNORECASE):
        acabamento = "Com Vidro"
    else:
        acabamento = "Sem Vidro"
    return {
        "tamanho": tamanho.group(0) if tamanho else "40x60",
        "acabamento": acabamento,
    }

def load_clips():
    if os.path.exists(CLIPS_FILE):
        with open(CLIPS_FILE) as f:
            return set(json.load(f))
    return set()

def save_clips(clips_set):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CLIPS_FILE, "w") as f:
        json.dump(list(clips_set), f)

def item_sem_clip(item_id, sem_clip_ids, numeric=False):
    if not sem_clip_ids:
        return True
    # A whitelist e global (ML + Shopee misturados); filtra so os ids do mesmo formato
    relevantes = {i for i in sem_clip_ids if i.isdigit()} if numeric else {i for i in sem_clip_ids if not i.isdigit()}
    if not relevantes:
        # Whitelist ainda nao populada para essa plataforma: mostra tudo
        return True
    return str(item_id) in relevantes

def fetch_ship_by_real(account_key, shipment_id):
    """Busca a data real de despacho via API de shipments do ML.
    Usa shipping_option.estimated_delivery_time.pay_before — prazo do vendedor para despachar."""
    data = ml_get(account_key, f"/shipments/{shipment_id}")
    if not data:
        return str(shipment_id), None
    edt = ((data.get("shipping_option") or {}).get("estimated_delivery_time")) or {}
    pay_before = edt.get("pay_before", "")
    if pay_before and len(pay_before) >= 10:
        return str(shipment_id), pay_before[:10]
    # fallback: buffering.date
    buffering = (data.get("shipping_option") or {}).get("buffering") or {}
    buf_date = buffering.get("date", "")
    if buf_date and len(buf_date) >= 10:
        return str(shipment_id), buf_date[:10]
    return str(shipment_id), None

def compute_ship_by_fallback(date_created_str):
    """Fallback: próximo dia útil após criação do pedido."""
    if not date_created_str:
        return ""
    try:
        created = datetime.fromisoformat(date_created_str.replace("Z", "+00:00"))
        d = created.date() + timedelta(days=1)
        while d.weekday() >= 5:
            d += timedelta(days=1)
        return str(d)
    except Exception:
        return ""

def fetch_items_batch(account_key, item_ids):
    result = {}
    ids = list(set(item_ids))
    for i in range(0, len(ids), 20):
        batch = ids[i:i+20]
        data = ml_get(account_key, "/items", params={"ids": ",".join(batch)})
        if isinstance(data, list):
            for entry in data:
                body = entry.get("body") or {}
                if body.get("id"):
                    result[body["id"]] = body
    return result

def get_paid_orders_without_clips(account_key, date_from=None, date_to=None, sem_clip_ids=None):
    acc = ACCOUNTS[account_key]
    if not acc.get("seller_id"):
        return []

    if not date_from:
        date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00.000-03:00")
    all_orders = []
    offset = 0

    while True:
        params = {
            "seller": acc["seller_id"],
            "order.status": "paid",
            "order.date_created.from": date_from,
            "limit": 50,
            "offset": offset,
        }
        if date_to:
            params["order.date_created.to"] = date_to
        data = ml_get(account_key, "/orders/search", params=params)
        if not data or not data.get("results"):
            break
        all_orders.extend(data["results"])
        total = data.get("paging", {}).get("total", 0)
        offset += 50
        if offset >= total:
            break

    item_ids = list({
        item.get("item", {}).get("id")
        for order in all_orders
        for item in order.get("order_items", [])
        if item.get("item", {}).get("id")
    })
    items_cache = fetch_items_batch(account_key, item_ids)

    seen = {}
    results = []

    for order in all_orders:
        for item in order.get("order_items", []):
            item_id = item.get("item", {}).get("id")
            if not item_id:
                continue
            item_data = items_cache.get(item_id, {})
            if not item_sem_clip(item_id, sem_clip_ids):
                continue

            variation_id = item.get("item", {}).get("variation_id")
            variation_attrs = {}
            sku = None

            if variation_id:
                for v in item_data.get("variations", []):
                    if str(v.get("id")) == str(variation_id):
                        for attr in v.get("attribute_combinations", []):
                            variation_attrs[attr.get("name", "").lower()] = attr.get("value_name") or "—"
                        sku = v.get("seller_custom_field") or v.get("user_product_id") or v.get("seller_sku")
                        break

            # Fallback: item-level attributes
            if not variation_attrs:
                for attr in item_data.get("attributes", []):
                    variation_attrs[attr.get("name", "").lower()] = attr.get("value_name") or "—"

            if not sku:
                sku = item_data.get("seller_custom_field") or item_data.get("seller_sku") or "—"

            title = item.get("item", {}).get("title", "")
            extracted = extract_from_title(title)

            raw_cor = pick_attr(variation_attrs, "cor da armação", "cor da moldura", "cor", "color")
            cor_moldura = normalize_cor(raw_cor)

            ship_by = compute_ship_by_fallback(order.get("date_created", ""))
            shipping_id = str(order.get("shipping", {}).get("id", ""))

            key = f"{item_id}_{variation_id or 'base'}"
            if key in seen:
                seen[key]["quantity"] += item.get("quantity", 1)
                seen[key]["order_ids"].append(str(order["id"]))
            else:
                entry = {
                    "order_id": order["id"],
                    "order_ids": [str(order["id"])],
                    "date": order["date_created"],
                    "ship_by": ship_by,
                    "_shipping_id": shipping_id,
                    "channel": acc["name"],
                    "item_id": item_id,
                    "title": title or "—",
                    "thumbnail": item_data.get("thumbnail", ""),
                    "sku": sku or "—",
                    "quantity": item.get("quantity", 1),
                    "tamanho": extracted["tamanho"],
                    "moldura": acc["moldura"],
                    "cor_moldura": cor_moldura,
                    "acabamento": extracted["acabamento"],
                }
                seen[key] = entry
                results.append(entry)

    # Busca datas reais de despacho do ML (só para os itens filtrados = poucas chamadas)
    sids = {e["_shipping_id"] for e in results if e.get("_shipping_id")}
    real_dates = {}
    if sids:
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
                futures = {pool.submit(fetch_ship_by_real, account_key, sid): sid for sid in sids}
                for f in concurrent.futures.as_completed(futures, timeout=15):
                    try:
                        sid, date = f.result(timeout=10)
                        if date:
                            real_dates[sid] = date
                    except Exception:
                        pass
        except Exception:
            pass  # fallback: mantém ship_by calculado

    for entry in results:
        sid = entry.pop("_shipping_id", "")
        if sid and sid in real_dates:
            entry["ship_by"] = real_dates[sid]

    return results

load_tokens()


# ── Auth routes ────────────────────────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        users = load_users()
        user = users.get(username)
        if user and user["password"] == hash_pw(password):
            session["user"] = username
            session["user_name"] = user["name"]
            session["user_role"] = user["role"]
            return redirect(url_for("index"))
        error = "Usuário ou senha incorretos."
    return render_template("login.html", error=error)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ── User management (master only) ──────────────────────────────────────────

@app.route("/api/users", methods=["GET"])
@master_required
def list_users():
    users = load_users()
    return jsonify([
        {"username": k, "name": v["name"], "role": v["role"]}
        for k, v in users.items()
    ])

@app.route("/api/users", methods=["POST"])
@master_required
def create_user():
    data = request.json
    username = data.get("username", "").strip()
    name = data.get("name", "").strip()
    password = data.get("password", "")
    if not username or not name or not password:
        return jsonify({"error": "Preencha todos os campos"}), 400
    users = load_users()
    if username in users:
        return jsonify({"error": "Usuário já existe"}), 400
    users[username] = {"password": hash_pw(password), "name": name, "role": "colaborador"}
    save_users(users)
    return jsonify({"ok": True})

@app.route("/api/users/<username>", methods=["DELETE"])
@master_required
def delete_user(username):
    if username == session.get("user"):
        return jsonify({"error": "Não é possível remover a si mesmo"}), 400
    users = load_users()
    if username not in users:
        return jsonify({"error": "Usuário não encontrado"}), 404
    del users[username]
    save_users(users)
    return jsonify({"ok": True})

@app.route("/api/users/<username>/password", methods=["PUT"])
@master_required
def change_password(username):
    data = request.json
    password = data.get("password", "")
    if not password:
        return jsonify({"error": "Senha não pode ser vazia"}), 400
    users = load_users()
    if username not in users:
        return jsonify({"error": "Usuário não encontrado"}), 404
    users[username]["password"] = hash_pw(password)
    save_users(users)
    return jsonify({"ok": True})

@app.route("/api/users/<username>/rename", methods=["PUT"])
@master_required
def rename_user(username):
    data = request.json
    new_username = data.get("new_username", "").strip()
    new_name = data.get("new_name", "").strip()
    if not new_username:
        return jsonify({"error": "Usuario não pode ser vazio"}), 400
    users = load_users()
    if username not in users:
        return jsonify({"error": "Usuário não encontrado"}), 404
    if new_username != username and new_username in users:
        return jsonify({"error": "Esse login já está em uso"}), 400
    user_data = users.pop(username)
    if new_name:
        user_data["name"] = new_name
    users[new_username] = user_data
    save_users(users)
    return jsonify({"ok": True})


# ── Main routes ────────────────────────────────────────────────────────────

def iso_to_ts(iso_str):
    if not iso_str:
        return None
    return int(datetime.fromisoformat(iso_str.replace("Z", "+00:00")).timestamp())

@app.route("/")
@login_required
def index():
    connected = {k: bool(v.get("token")) for k, v in ACCOUNTS.items()}
    return render_template("index.html", accounts=ACCOUNTS, connected=connected,
                           user_name=session.get("user_name"),
                           user_role=session.get("user_role"))

@app.route("/connect/<account_key>")
@login_required
def connect(account_key):
    acc = ACCOUNTS.get(account_key)
    if not acc:
        return "Conta nao encontrada", 404

    auth_url = (
        f"https://auth.mercadolivre.com.br/authorization"
        f"?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&state={account_key}"
        f"&scope=offline_access+product_ads"
    )
    return redirect(auth_url)

@app.route("/callback")
def callback():
    code = request.args.get("code")
    account_key = request.args.get("state")
    if not code or not account_key:
        return "Erro no callback. Tente novamente.", 400

    r = requests.post("https://api.mercadolibre.com/oauth/token", data={
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
    })
    if r.status_code != 200:
        return f"Erro ao obter token: {r.text}", 400

    d = r.json()
    ACCOUNTS[account_key]["token"] = d["access_token"]
    ACCOUNTS[account_key]["refresh_token"] = d.get("refresh_token")

    me = requests.get("https://api.mercadolibre.com/users/me",
                      headers={"Authorization": f"Bearer {d['access_token']}"}).json()
    ACCOUNTS[account_key]["seller_id"] = me.get("id")
    ACCOUNTS[account_key]["nickname"] = me.get("nickname")
    save_tokens()
    return redirect(url_for("index"))

@app.route("/api/orders")
@login_required
def api_orders():
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    sem_clip_ids = load_clips()
    all_orders = []
    for key, acc in ACCOUNTS.items():
        if acc.get("token"):
            all_orders.extend(get_paid_orders_without_clips(key, date_from, date_to, sem_clip_ids))
    all_orders.sort(key=lambda x: x["date"], reverse=True)
    return jsonify(all_orders)

@app.route("/api/clips/<item_id>", methods=["DELETE"])
@login_required
def mark_clip(item_id):
    # Remove da whitelist — item ganhou clip, não precisa mais aparecer
    clips = load_clips()
    clips.discard(item_id.upper())
    save_clips(clips)
    return jsonify({"ok": True})

@app.route("/api/clips/bulk", methods=["POST"])
@login_required
def bulk_mark_clips():
    ids = request.json.get("ids", [])
    clips = load_clips()
    before = len(clips)
    for item_id in ids:
        clips.add(item_id.upper())
    save_clips(clips)
    return jsonify({"added": len(clips) - before, "total": len(clips)})

@app.route("/api/clips/bulk-remove", methods=["POST"])
@login_required
def bulk_remove_clips():
    ids = request.json.get("ids", [])
    clips = load_clips()
    before = len(clips)
    for item_id in ids:
        clips.discard(item_id.upper())
    save_clips(clips)
    return jsonify({"removed": before - len(clips), "total": len(clips)})

@app.route("/api/clips")
@login_required
def list_clips():
    return jsonify(list(load_clips()))


@app.route("/api/debug/shipment/<account_key>")
@master_required
def debug_shipment(account_key):
    acc = ACCOUNTS.get(account_key)
    if not acc or not acc.get("token"):
        return jsonify({"error": "Conta nao conectada"}), 400
    # Pega o primeiro pedido pago e retorna o shipment cru
    data = ml_get(account_key, "/orders/search", params={
        "seller": acc["seller_id"], "order.status": "paid", "limit": 1
    })
    if not data or not data.get("results"):
        return jsonify({"error": "Nenhum pedido encontrado"})
    order = data["results"][0]
    shipping_id = order.get("shipping", {}).get("id")
    shipment = ml_get(account_key, f"/shipments/{shipping_id}") if shipping_id else None
    return jsonify({"order_shipping": order.get("shipping"), "shipment": shipment})

@app.route("/api/debug/orders-shipby/<account_key>")
@master_required
def debug_orders_shipby(account_key):
    """Retorna JSON completo do primeiro shipment para identificar o campo de prazo."""
    acc = ACCOUNTS.get(account_key)
    if not acc or not acc.get("token"):
        return jsonify({"error": "Conta nao conectada"}), 400
    date_from = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%dT00:00:00.000-03:00")
    data = ml_get(account_key, "/orders/search", params={
        "seller": acc["seller_id"], "order.status": "paid",
        "order.date_created.from": date_from, "limit": 3
    })
    if not data or not data.get("results"):
        return jsonify({"error": "Nenhum pedido"})
    results = []
    for order in data["results"][:3]:
        sid = order.get("shipping", {}).get("id")
        shipment = ml_get(account_key, f"/shipments/{sid}") if sid else None
        results.append({
            "order_id": order["id"],
            "date_created": order.get("date_created", "")[:16],
            "shipping_id": sid,
            "shipment_full": shipment,
        })
    return jsonify(results)

@app.route("/api/debug/order-items/<account_key>/<int:order_id>")
@master_required
def debug_order_items(account_key, order_id):
    """Mostra os IDs de anúncio e status de um pedido específico."""
    acc = ACCOUNTS.get(account_key)
    if not acc or not acc.get("token"):
        return jsonify({"error": "Conta nao conectada"}), 400
    # Tenta direto primeiro, depois busca
    data = ml_get(account_key, f"/orders/{order_id}")
    if not data:
        # Tenta via search
        search = ml_get(account_key, "/orders/search", params={"q": str(order_id), "limit": 1})
        results = (search or {}).get("results", [])
        if results:
            data = results[0]
        else:
            # Mostra erro real
            acc2 = ACCOUNTS.get(account_key)
            headers2 = {"Authorization": f"Bearer {acc2['token']}"}
            r2 = requests.get(f"https://api.mercadolibre.com/orders/{order_id}", headers=headers2, timeout=8)
            return jsonify({"error": f"Nao encontrado em {account_key}", "api_status": r2.status_code, "seller_id": acc2.get("seller_id")})
    sem_clip_ids = load_clips()
    items = []
    for item in data.get("order_items", []):
        item_id = item.get("item", {}).get("id", "")
        items.append({
            "item_id": item_id,
            "title": item.get("item", {}).get("title", ""),
            "esta_na_lista_sem_clip": item_id in sem_clip_ids,
        })
    sid = data.get("shipping", {}).get("id")
    ship_data = ml_get(account_key, f"/shipments/{sid}") if sid else None
    pay_before = None
    if ship_data:
        edt = ((ship_data.get("shipping_option") or {}).get("estimated_delivery_time")) or {}
        pay_before = edt.get("pay_before")
    return jsonify({
        "order_id": order_id,
        "order_status": data.get("status"),
        "shipping_id": sid,
        "pay_before": pay_before,
        "items": items,
    })

@app.route("/api/debug/busca-sku/<account_key>/<sku>")
@master_required
def debug_busca_sku(account_key, sku):
    """Encontra o MLB ID de um item pelo SKU do vendedor via API de items."""
    acc = ACCOUNTS.get(account_key)
    if not acc or not acc.get("token"):
        return jsonify({"error": "Conta nao conectada"}), 400
    seller_id = acc.get("seller_id")
    found = []
    # Busca por seller_sku e user_product_id
    for param in ["seller_sku", "user_product_id"]:
        data = ml_get(account_key, f"/users/{seller_id}/items/search", params={param: sku, "limit": 20})
        if data and data.get("results"):
            item_ids = data["results"]
            # Busca detalhes dos itens
            details = ml_get(account_key, "/items", params={"ids": ",".join(item_ids[:20])})
            if isinstance(details, list):
                for entry in details:
                    body = (entry.get("body") or {})
                    if body.get("id"):
                        found.append({
                            "item_id": body["id"],
                            "title": body.get("title", "")[:60],
                            "seller_custom_field": body.get("seller_custom_field"),
                            "user_product_id": body.get("user_product_id"),
                            "status": body.get("status"),
                        })
    return jsonify({"sku_buscado": sku, "resultados": found})

@app.route("/api/debug/proximos-sem-clip/<account_key>")
@master_required
def debug_proximos_sem_clip(account_key):
    """Lista todos os itens dos pedidos 'próximos dias' indicando se estão na lista sem clip."""
    acc = ACCOUNTS.get(account_key)
    if not acc or not acc.get("token"):
        return jsonify({"error": "Conta nao conectada"}), 400
    sem_clip_ids = load_clips()
    hoje = datetime.now().date()
    date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00.000-03:00")
    all_orders = []
    offset = 0
    while True:
        data = ml_get(account_key, "/orders/search", params={
            "seller": acc["seller_id"], "order.status": "paid",
            "order.date_created.from": date_from, "limit": 50, "offset": offset,
        })
        if not data or not data.get("results"):
            break
        all_orders.extend(data["results"])
        total = data.get("paging", {}).get("total", 0)
        offset += 50
        if offset >= total:
            break

    results = []
    for order in all_orders:
        ship_by = compute_ship_by_fallback(order.get("date_created", ""))
        if not ship_by or ship_by <= str(hoje):
            continue  # só próximos dias
        for item in order.get("order_items", []):
            item_id = item.get("item", {}).get("id", "")
            if not item_id:
                continue
            na_lista = item_id in sem_clip_ids
            results.append({
                "order_id": order["id"],
                "date_created": order.get("date_created", "")[:10],
                "fallback_ship_by": ship_by,
                "item_id": item_id,
                "title": item.get("item", {}).get("title", "")[:60],
                "na_lista_sem_clip": na_lista,
            })
    sem_clip = [r for r in results if r["na_lista_sem_clip"]]
    com_clip = [r for r in results if not r["na_lista_sem_clip"]]
    return jsonify({
        "total_itens_proximos_dias": len(results),
        "sem_clip_na_lista": len(sem_clip),
        "com_clip_ou_nao_monitorado": len(com_clip),
        "itens_sem_clip": sem_clip,
        "itens_nao_monitorados_amostra": com_clip[:20],
    })

@app.route("/api/debug/clips")
@login_required
def debug_clips():
    results = {}
    for key in ACCOUNTS:
        acc = ACCOUNTS[key]
        if not acc.get("token") or not acc.get("seller_id"):
            continue
        token = acc["token"]
        headers = {"Authorization": f"Bearer {token}"}
        seller_id = acc["seller_id"]
        tests = {}
        for params in [
            {"filters": "PENDING_CLIPS", "limit": 5},
            {"clip_status": "pending", "limit": 5},
            {"has_video": "false", "limit": 5},
        ]:
            r = requests.get(
                f"https://api.mercadolibre.com/users/{seller_id}/items/search",
                headers=headers, params=params
            )
            tests[str(params)] = {"status": r.status_code, "body": r.json() if r.status_code == 200 else r.text[:400]}
        results[key] = tests
    return jsonify(results)


# ── Gerador de Títulos ────────────────────────────────────────────────────

def load_keywords():
    if os.path.exists(KEYWORDS_FILE):
        with open(KEYWORDS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}

def _clean(s):
    return " ".join(s.split())

def _fill_to(base, target_min, target_max, fillers):
    """Tenta completar 'base' adicionando palavras de 'fillers' até atingir [target_min, target_max]."""
    title = base
    for word in fillers:
        if len(title) >= target_min:
            break
        candidate = _clean(title + " " + word)
        if len(candidate) <= target_max:
            title = candidate
    return title

def _titulo_ml(estilo, nome, quantidade, tamanho, vidro, conta_key):
    filete  = (conta_key == "nova_gq")
    kit_str = {"avulso": "", "duo": "Kit ", "trio": "Trio "}[quantidade]
    suffix  = " Filete" if filete else ""
    tmin = 57 - len(suffix)
    tmax = 60 - len(suffix)

    if filete:
        # nova_gq: estilo ANTES do tamanho (mais buscado), nome DEPOIS (diferencial)
        if vidro:
            bases = [
                f"Quadro Com Moldura E Vidro {kit_str}{estilo} {tamanho} {nome}",
                f"Quadro Decorativo Com Vidro {kit_str}{estilo} {tamanho} {nome}",
                f"Quadro Decorativo Vidro {kit_str}{estilo} {tamanho} {nome}",
            ]
        else:
            bases = [
                f"Quadro Decorativo Com Moldura {kit_str}{estilo} {tamanho} {nome}",
                f"Quadro Decorativo Sala {kit_str}{estilo} {tamanho} {nome}",
                f"Quadro Decorativo Moldura {kit_str}{estilo} {tamanho} {nome}",
            ]
        fillers = ["Grande", "Sala", "Para Sala"]
    else:
        # freewall: tamanho antes do kit; estilo+nome juntos após kit (estilo primeiro)
        if vidro:
            bases = [
                f"Quadro Sala Quarto Com Vidro Moldura {tamanho} {kit_str}{estilo} {nome}",
                f"Quadro Decorativo Sala Quarto Vidro {tamanho} {kit_str}{estilo} {nome}",
                f"Quadro Decorativo Quarto Sala Vidro {tamanho} {kit_str}{estilo} {nome}",
            ]
        else:
            bases = [
                f"Quadro Decorativo Sala Quarto {tamanho} {kit_str}{estilo} {nome}",
                f"Quadro Decorativo Quarto Sala {tamanho} {kit_str}{estilo} {nome}",
                f"Quadro Decorativo Sala Quarto {kit_str}{tamanho} {estilo} {nome}",
            ]
        fillers = ["Moldura", "Poster", "Arte", "Grande", "Com Moldura"]

    results = []
    for raw_base in bases:
        base   = _clean(raw_base)
        filled = _fill_to(base, tmin, tmax, fillers)
        if len(filled) > tmax:
            filled = filled[:tmax].rsplit(" ", 1)[0]
        final  = _clean(filled + suffix)
        # Se o nome foi fornecido mas sumiu por truncagem, marcar como inválido
        nome_ok = (not nome) or (nome.split()[0].lower() in final.lower())
        results.append({
            "title": final[:60],
            "chars": len(final[:60]),
            "ok": 57 <= len(final) <= 60 and nome_ok,
        })
    return results

def _titulo_shopee(estilo, nome, quantidade, conta_key):
    filete  = (conta_key == "freewall")
    kit_str = {"avulso": "", "duo": "Kit ", "trio": "Trio "}[quantidade]
    fl      = " Filete" if filete else ""
    tema    = _clean(f"{estilo} {nome}")  # Shopee não separa por tamanho

    kw = load_keywords()
    l1_pool  = [k["term"] for k in kw.get("lugares1", [])[1:]]
    l2_pool  = [k["term"] for k in kw.get("lugares2", [])]
    mat_pool = [k["term"] for k in kw.get("materiais", [])]
    fillers_shp = l1_pool[:4] + mat_pool[:4] + l2_pool[:3]

    templates_base = [
        _clean(f"Quadro Decorativo Sala {kit_str}{tema}{fl}"),
        _clean(f"Quadro Decorativo Sala {kit_str}{tema} Decorativo{fl}"),
        _clean(f"Quadros Decorativos Sala {kit_str}{tema}{fl}"),
    ]

    results = []
    for base in templates_base:
        title = _fill_to(base, 96, 99, fillers_shp)
        results.append({
            "title": title[:99],
            "chars": len(title[:99]),
            "ok": 96 <= len(title) <= 99,
        })
    return results

@app.route("/api/titulos/gerar", methods=["POST"])
@master_required
def gerar_titulo():
    d = request.json or {}
    plataforma = d.get("plataforma", "ml")
    conta_key  = d.get("conta", "nova_gq")
    estilo     = (d.get("estilo") or "").strip()
    nome       = (d.get("nome") or "").strip()
    quantidade = d.get("quantidade", "avulso")
    tamanho    = d.get("tamanho", "40x60")
    vidro      = bool(d.get("vidro", False))

    if not estilo:
        return jsonify({"error": "Informe o estilo/categoria"}), 400

    if plataforma == "ml":
        titulos = _titulo_ml(estilo, nome, quantidade, tamanho, vidro, conta_key)
    else:
        titulos = _titulo_shopee(estilo, nome, quantidade, conta_key)

    return jsonify({"titulos": titulos})

@app.route("/api/titulos/existentes")
@master_required
def titulos_existentes():
    """Coleta todos os títulos ativos das contas ML para checagem de duplicidade."""
    existentes = []
    for key, acc in ACCOUNTS.items():
        if not acc.get("token") or not acc.get("seller_id"):
            continue
        seller_id = acc["seller_id"]
        offset = 0
        while True:
            data = ml_get(key, f"/users/{seller_id}/items/search",
                          params={"status": "active", "limit": 100, "offset": offset})
            if not data or not data.get("results"):
                break
            ids = data["results"]
            details = ml_get(key, "/items", params={"ids": ",".join(ids), "attributes": "id,title"})
            if isinstance(details, list):
                for entry in details:
                    body = entry.get("body") or {}
                    if body.get("title"):
                        existentes.append({"id": body["id"], "title": body["title"], "conta": acc["name"]})
            if offset + 100 >= data.get("paging", {}).get("total", 0):
                break
            offset += 100
    return jsonify(existentes)


def _build_relatorio_pdf(payload):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    )
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    GRAY_HDR = rl_colors.HexColor('#EFEFEF')
    GRAY_TOT = rl_colors.HexColor('#E0E0E0')
    GRID     = rl_colors.HexColor('#BBBBBB')
    BLACK    = rl_colors.HexColor('#000000')
    DARK     = rl_colors.HexColor('#1C1C1C')
    GRAY     = rl_colors.HexColor('#666666')
    WHITE    = rl_colors.white

    PAGE_W, PAGE_H = A4
    MAR   = 1.8 * cm
    AVAIL = PAGE_W - 2 * MAR

    def brl(v):
        s = f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"R$ {s}"

    def pct(v, sign=True):
        v = float(v)
        s = f"{abs(v):.1f}".replace(".", ",") + "%"
        return ("+" if (sign and v >= 0) else ("-" if v < 0 else "")) + s

    def dec(v, places=2):
        return f"{float(v):.{places}f}".replace(".", ",")

    def ps(fn="Helvetica", fs=9, tc=DARK, align=TA_LEFT, leading=None):
        return ParagraphStyle('_', fontName=fn, fontSize=fs, textColor=tc,
                              alignment=align, leading=leading or fs * 1.3)

    def P(txt, **kw):
        return Paragraph(str(txt), ps(**kw))

    PAD = [
        ('TOPPADDING',    (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING',   (0,0), (-1,-1), 6),
        ('RIGHTPADDING',  (0,0), (-1,-1), 6),
        ('VALIGN',        (0,0), (-1,-1), 'MIDDLE'),
    ]

    story = []
    exportado = payload.get("exportado_em", datetime.now().strftime("%d/%m/%Y"))
    proj_data = payload.get("proj", {})
    comp_data = payload.get("comp", {})

    # ── Cabeçalho ─────────────────────────────────────────────────────────────
    story.append(P("Projeções e Comparativo Real", fn='Helvetica-Bold', fs=16, tc=BLACK))
    story.append(Spacer(1, 3))
    story.append(P(f"Go Quadros — Marketplaces — Exportado em {exportado}", tc=GRAY, fs=9))
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.8, color=BLACK))
    story.append(Spacer(1, 14))

    # ── Projeções ─────────────────────────────────────────────────────────────
    mes       = proj_data.get("mes", "")
    periodo   = proj_data.get("periodo", "")
    dias_dec  = int(proj_data.get("dias_dec", 1))
    dias_tot  = int(proj_data.get("dias_total", 30))
    meta      = float(proj_data.get("meta", 0))
    meta_mes  = proj_data.get("meta_mes", "")
    canais_p  = proj_data.get("canais", [])
    total_p   = float(proj_data.get("total_proj", 0))
    diff      = total_p - meta
    diff_pct  = (diff / meta * 100) if meta else 0

    story.append(P(f"Projeções Mensais — {mes}/{exportado[-4:]}", fn='Helvetica-Bold', fs=11, tc=BLACK))
    story.append(Spacer(1, 2))
    story.append(P(f"Período registrado: {periodo} ({dias_dec} dias de {dias_tot})", tc=GRAY, fs=8))
    story.append(Spacer(1, 8))

    cw1 = [6.5*cm, 6.0*cm, AVAIL - 6.5*cm - 6.0*cm]
    H = dict(fn='Helvetica-Bold', fs=9, tc=BLACK)
    rows1 = [[
        P("Canal",                 **H, align=TA_LEFT),
        P("Faturamento Projetado", **H, align=TA_RIGHT),
        P("Var. vs Mês Anterior",  **H, align=TA_CENTER),
    ]]
    for c in canais_p:
        rows1.append([
            P(c["label"],          align=TA_LEFT),
            P(brl(c["fat_proj"]),  align=TA_RIGHT),
            P(pct(c["var_pct"]),   align=TA_CENTER),
        ])
    rows1.append([
        P("Meta Mínima Líquida — " + meta_mes, **H, align=TA_LEFT),
        P(brl(meta),                            **H, align=TA_RIGHT),
        P("",                                   align=TA_CENTER),
    ])
    rows1.append([
        P("TOTAL",                         **H, align=TA_LEFT),
        P(brl(total_p),                    **H, align=TA_RIGHT),
        P(pct(diff_pct) + " vs meta",      **H, align=TA_CENTER),
    ])
    t1 = Table(rows1, colWidths=cw1)
    t1.setStyle(TableStyle(PAD + [
        ('GRID',       (0,0),  (-1,-1), 0.5, GRID),
        ('BACKGROUND', (0,0),  (-1, 0), GRAY_HDR),
        ('BACKGROUND', (0,-2), (-1,-2), GRAY_HDR),
        ('BACKGROUND', (0,-1), (-1,-1), GRAY_TOT),
        ('LINEABOVE',  (0,-1), (-1,-1), 1.0, BLACK),
    ]))
    story.append(t1)
    story.append(Spacer(1, 22))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRID))
    story.append(Spacer(1, 14))

    # ── Comparativo ───────────────────────────────────────────────────────────
    p1_label  = comp_data.get("p1", "")
    p2_label  = comp_data.get("p2", "")
    canais_c  = comp_data.get("canais", [])
    total_c   = comp_data.get("total", {})

    story.append(P("Comparativo Real x Mês Anterior", fn='Helvetica-Bold', fs=11, tc=BLACK))
    story.append(Spacer(1, 2))
    story.append(P(f"Período {p1_label}  vs  {p2_label}", tc=GRAY, fs=8))
    story.append(Spacer(1, 8))

    cw2 = [3.6*cm, 2.5*cm, 1.6*cm, 1.6*cm, 0.6*cm, 2.5*cm, 1.6*cm, 1.6*cm, 2.2*cm]
    HC = dict(fn='Helvetica-Bold', fs=8, tc=BLACK, align=TA_CENTER)
    hdr2 = [
        P("Canal",    **{**HC, 'align': TA_LEFT}),
        P("Fat. " + p1_label.split(" a ")[0][:5] if p1_label else "Fat. P1", **HC),
        P("ACOS",     **HC), P("ROAS",     **HC), P("",         **HC),
        P("Fat. " + p2_label.split(" a ")[0][:5] if p2_label else "Fat. P2", **HC),
        P("ACOS",     **HC), P("ROAS",     **HC), P("Var. Fat.", **HC),
    ]
    rows2 = [hdr2]
    for c in canais_c:
        rows2.append([
            P(c["label"],        align=TA_LEFT,   fs=9),
            P(brl(c["f1"]),      align=TA_RIGHT,  fs=9),
            P(dec(c["acos1"])+"%", align=TA_CENTER, fs=9),
            P(dec(c["roas1"])+"x", align=TA_CENTER, fs=9),
            P("→",               align=TA_CENTER, fs=9, tc=GRAY),
            P(brl(c["f2"]),      align=TA_RIGHT,  fs=9),
            P(dec(c["acos2"])+"%", align=TA_CENTER, fs=9),
            P(dec(c["roas2"])+"x", align=TA_CENTER, fs=9),
            P(pct(c["var"]),     align=TA_CENTER, fs=9),
        ])
    if total_c:
        rows2.append([
            P("TOTAL",                    fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_LEFT),
            P(brl(total_c["f1"]),         fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_RIGHT),
            P(dec(total_c["acos1"])+"%",  fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_CENTER),
            P(dec(total_c["roas1"])+"x",  fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_CENTER),
            P("→",                        fn='Helvetica-Bold', fs=9, tc=GRAY,  align=TA_CENTER),
            P(brl(total_c["f2"]),         fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_RIGHT),
            P(dec(total_c["acos2"])+"%",  fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_CENTER),
            P(dec(total_c["roas2"])+"x",  fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_CENTER),
            P(pct(total_c["var"]),        fn='Helvetica-Bold', fs=9, tc=BLACK, align=TA_CENTER),
        ])
    t2 = Table(rows2, colWidths=cw2)
    t2.setStyle(TableStyle(PAD + [
        ('GRID',       (0,0),  (-1,-1), 0.5, GRID),
        ('BACKGROUND', (0,0),  (-1, 0), GRAY_HDR),
        ('BACKGROUND', (0,-1), (-1,-1), GRAY_TOT),
        ('LINEABOVE',  (0,-1), (-1,-1), 1.0, BLACK),
        ('LINEAFTER',  (3,0),  (3,-1),  1.0, BLACK),
        ('LINEBEFORE', (5,0),  (5,-1),  1.0, BLACK),
    ]))
    story.append(t2)

    # ── Análise ───────────────────────────────────────────────────────────────
    analise_raw = payload.get("analise", "").strip()
    if analise_raw:
        import re
        analise_clean = re.sub(r'[^\x00-\xFF]', '', analise_raw).strip()
        story.append(Spacer(1, 16))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GRID))
        story.append(Spacer(1, 12))
        story.append(P("Análise", fn='Helvetica-Bold', fs=11, tc=BLACK))
        story.append(Spacer(1, 8))
        for bloco in analise_clean.split('\n\n'):
            bloco = bloco.strip()
            if bloco:
                story.append(P(bloco, tc=DARK, fs=9, leading=14))
                story.append(Spacer(1, 6))

    # ── Rodapé ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRID))
    story.append(Spacer(1, 4))
    story.append(P(f"Go Quadros — Relatório interno de marketplaces  ·  Gerado em {exportado}",
                   tc=GRAY, fs=7, align=TA_CENTER))

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MAR, rightMargin=MAR,
        topMargin=MAR, bottomMargin=MAR,
        title="Relatório Marketplaces — Go Quadros",
        author="Go Quadros",
    )
    doc.build(story)
    buf.seek(0)
    return buf


@app.route("/api/relatorio-pdf", methods=["POST"])
@login_required
def relatorio_pdf():
    try:
        payload = request.get_json(force=True)
        buf = _build_relatorio_pdf(payload)
        nome = "relatorio_marketplaces_" + datetime.now().strftime("%d%m%Y") + ".pdf"
        return send_file(buf, mimetype="application/pdf",
                         as_attachment=True, download_name=nome)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Ads Gap ────────────────────────────────────────────────────────────────

def load_ads_config():
    if os.path.exists(ADS_CONFIG_FILE):
        with open(ADS_CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_ads_config(cfg):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(ADS_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def _get_campaign_items_api(account_key, campaign_ids):
    """Tenta buscar itens de campanha via ML API. Retorna (set_ids, api_ok)."""
    acc = ACCOUNTS[account_key]
    if not acc.get("token"):
        return set(), False
    items = set()
    for camp_id in campaign_ids:
        headers = {"Authorization": f"Bearer {acc['token']}"}
        r = requests.get(
            f"https://api.mercadolibre.com/advertising/product_ads/campaigns/{camp_id}/ad_items",
            headers=headers, params={"limit": 100}, timeout=10
        )
        if r.status_code == 401 and refresh_token(account_key):
            headers = {"Authorization": f"Bearer {ACCOUNTS[account_key]['token']}"}
            r = requests.get(
                f"https://api.mercadolibre.com/advertising/product_ads/campaigns/{camp_id}/ad_items",
                headers=headers, params={"limit": 100}, timeout=10
            )
        if r.status_code != 200:
            return items, False  # 403 ou outro erro → modo manual
        data = r.json()
        results = data if isinstance(data, list) else data.get("results", [])
        for it in results:
            iid = it.get("item_id") or it.get("id")
            if iid:
                items.add(str(iid))
    return items, True

def _get_ml_items_with_sales(account_key, max_items=1000):
    """Retorna lista de itens com sold_quantity > 0, ordenados desc."""
    seller_id = ACCOUNTS[account_key].get("seller_id")
    if not seller_id:
        return []
    all_ids = []
    offset = 0
    while offset < max_items:
        data = ml_get(account_key, f"/users/{seller_id}/items/search",
                      params={"limit": 100, "offset": offset})
        if not data:
            break
        ids = data.get("results", [])
        all_ids.extend(ids)
        total = data.get("paging", {}).get("total", 0)
        if len(all_ids) >= min(total, max_items) or not ids:
            break
        offset += 100
    items = []
    for i in range(0, len(all_ids), 20):
        batch = all_ids[i:i+20]
        data = ml_get(account_key, "/items", params={"ids": ",".join(batch)})
        if data:
            for entry in data:
                body = entry.get("body", {})
                if entry.get("code") == 200 and body.get("sold_quantity", 0) > 0:
                    items.append({
                        "id": body["id"],
                        "titulo": body.get("title", ""),
                        "vendidos": body["sold_quantity"],
                        "preco": body.get("price", 0),
                    })
    return sorted(items, key=lambda x: x["vendidos"], reverse=True)

@app.route("/api/ads-gap/<account_key>")
@login_required
def ads_gap(account_key):
    if account_key not in ACCOUNTS:
        return jsonify({"error": "Conta não encontrada"}), 404
    cfg = load_ads_config()
    acc_cfg = cfg.get(account_key, {})
    campaign_ids = [c["id"] for c in acc_cfg.get("campaigns", [])]

    # Tenta API; se 403 usa lista manual
    ad_items, api_ok = _get_campaign_items_api(account_key, campaign_ids)
    if not api_ok:
        ad_items = set(str(i) for i in acc_cfg.get("manual_ad_items", []))

    items_with_sales = _get_ml_items_with_sales(account_key)
    not_in_ads = [it for it in items_with_sales if it["id"] not in ad_items]
    in_ads     = [it for it in items_with_sales if it["id"] in ad_items]

    ts = datetime.now().isoformat()
    if account_key not in cfg:
        cfg[account_key] = {}
    cfg[account_key]["last_updated"] = ts
    cfg[account_key]["cached_gap"] = not_in_ads
    save_ads_config(cfg)

    return jsonify({
        "api_mode": api_ok,
        "total_com_vendas": len(items_with_sales),
        "em_campanhas": len(in_ads),
        "fora_de_campanhas": len(not_in_ads),
        "gap": not_in_ads,
        "timestamp": ts,
    })

@app.route("/api/ads-config/<account_key>", methods=["GET"])
@login_required
def get_ads_config_route(account_key):
    cfg = load_ads_config()
    return jsonify(cfg.get(account_key, {}))

@app.route("/api/ads-config/<account_key>/items", methods=["POST"])
@login_required
def update_ads_items(account_key):
    """Atualiza lista manual de itens em Product Ads (MLB IDs colados pelo usuário)."""
    data = request.get_json(force=True)
    raw = data.get("items", [])
    items = [s.strip() for s in raw if str(s).strip()]
    cfg = load_ads_config()
    if account_key not in cfg:
        cfg[account_key] = {}
    cfg[account_key]["manual_ad_items"] = items
    cfg[account_key]["manual_updated"] = datetime.now().isoformat()
    save_ads_config(cfg)
    return jsonify({"ok": True, "count": len(items)})


# ── Sales History ─────────────────────────────────────────────────────────────

# Mapeia account_key → canal_id usado no JS (CANAIS)
ML_CANAL_MAP = {
    "freewall": "ml1",
    "nova_gq":  "ml2",
}

def load_sales_history():
    if os.path.exists(SALES_HISTORY_FILE):
        with open(SALES_HISTORY_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"period_cache": {}, "manual_last": {}}

def save_sales_history(h):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SALES_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False, indent=2)

def _fetch_ml_period_total(account_key, date_from, date_to):
    """Soma total_amount de todos os pedidos pagos no período. Retorna float."""
    seller_id = ACCOUNTS[account_key].get("seller_id")
    if not seller_id:
        return None
    total = 0.0
    offset = 0
    while True:
        data = ml_get(account_key, "/orders/search", params={
            "seller": seller_id,
            "order.status": "paid",
            "order.date_created.from": f"{date_from}T00:00:00.000-0300",
            "order.date_created.to":   f"{date_to}T23:59:59.000-0300",
            "limit": 50,
            "offset": offset,
        })
        if not data:
            break
        results = data.get("results", [])
        for order in results:
            total += float(order.get("total_amount", 0) or 0)
        paging = data.get("paging", {})
        offset += len(results)
        if offset >= paging.get("total", 0) or not results:
            break
    return total

@app.route("/api/sales/collect")
@login_required
def sales_collect():
    """Busca faturamento ML bruto de ambas as contas para o período informado."""
    date_from = request.args.get("from", "")
    date_to   = request.args.get("to", "")
    force     = request.args.get("force", "0") == "1"
    if not date_from or not date_to:
        return jsonify({"error": "Parâmetros 'from' e 'to' obrigatórios (YYYY-MM-DD)"}), 400

    period_key = f"{date_from}_{date_to}"
    history = load_sales_history()
    pc = history.setdefault("period_cache", {})
    results = {}

    for account_key, canal_id in ML_CANAL_MAP.items():
        if account_key not in ACCOUNTS:
            continue
        cached = pc.get(account_key, {}).get(period_key)
        # Usa cache se tiver e não for forçado, e tiver menos de 6h
        if cached and not force:
            age_h = (datetime.now() - datetime.fromisoformat(cached["fetched_at"])).total_seconds() / 3600
            if age_h < 6:
                results[canal_id] = cached["total"]
                continue
        total = _fetch_ml_period_total(account_key, date_from, date_to)
        if total is not None:
            results[canal_id] = total
            pc.setdefault(account_key, {})[period_key] = {
                "total": total,
                "fetched_at": datetime.now().isoformat(),
            }

    save_sales_history(history)
    return jsonify({
        "results": results,
        "from": date_from,
        "to": date_to,
        "cached": not force,
        "timestamp": datetime.now().isoformat(),
    })

@app.route("/api/sales/manual", methods=["POST"])
@login_required
def sales_save_manual():
    """Salva os últimos valores digitados de Shopee/TikTok."""
    data = request.get_json(force=True)
    history = load_sales_history()
    history["manual_last"] = data.get("values", {})
    save_sales_history(history)
    return jsonify({"ok": True})

@app.route("/api/sales/manual")
@login_required
def sales_get_manual():
    history = load_sales_history()
    return jsonify(history.get("manual_last", {}))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
