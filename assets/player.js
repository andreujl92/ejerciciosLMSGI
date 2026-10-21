/* =========================================================
   Reproductor de ejemplos guiados · LMSGI · Prof. Andreu Juan Luna
   Lee window.EJEMPLO = { pasos: [{ titulo, detalle, fichero, codigo, vista? }] }
   «codigo» es el contenido completo del fichero al terminar el paso.
   ========================================================= */
(function () {
  "use strict";
  const E = window.EJEMPLO;
  const $ = (s) => document.querySelector(s);

  const VELOCIDADES = {
    lenta: { ms: 32, pausa: 2600 },
    normal: { ms: 14, pausa: 1500 },
    rapida: { ms: 4, pausa: 700 },
  };

  // ---------- estados precalculados: contenido de cada fichero tras cada paso ----------
  const ficheros = [];
  E.pasos.forEach((p) => { if (!ficheros.includes(p.fichero)) ficheros.push(p.fichero); });
  const estados = [];
  let acumulado = {};
  ficheros.forEach((f) => (acumulado[f] = ""));
  E.pasos.forEach((p) => {
    acumulado = Object.assign({}, acumulado, { [p.fichero]: p.codigo });
    estados.push(acumulado);
  });
  const vacio = Object.fromEntries(ficheros.map((f) => [f, ""]));

  let paso = -1;            // último paso completado (-1 = ninguno)
  let reproduciendo = false;
  let temporizador = null;
  let velocidad = "normal";
  let ficheroVisible = ficheros[0];
  let marca = null;         // { fichero, ini, fin } zona añadida en el último paso
  let ultimaVista = 0;

  // ---------- resaltado de sintaxis ----------
  const ext = (f) => f.split(".").pop().toLowerCase();
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function tokensMarcas(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      if (src.startsWith("<!--", i)) {
        let j = src.indexOf("-->", i); j = j < 0 ? src.length : j + 3;
        out.push([src.slice(i, j), "com"]); i = j; continue;
      }
      const m = /^<[\/?!]?[\w:.\-]*/.exec(src.slice(i));
      if (src[i] === "<" && m) {
        out.push([m[0], "tag"]); i += m[0].length;
        // dentro de la etiqueta
        while (i < src.length) {
          const r = /^(\s+|\??\/?>|[\w:.\-]+(?==)|=|"[^"]*"?|'[^']*'?|[^\s>]+)/.exec(src.slice(i));
          if (!r) break;
          const t = r[0];
          let k = "attr";
          if (/^\s+$/.test(t)) k = "";
          else if (t.endsWith(">")) k = "tag";
          else if (t === "=") k = "punct";
          else if (t[0] === '"' || t[0] === "'") k = "str";
          out.push([t, k]); i += t.length;
          if (t.endsWith(">")) break;
        }
        continue;
      }
      let j = src.indexOf("<", i + 1); j = j < 0 ? src.length : j;
      out.push([src.slice(i, j), ""]); i = j;
    }
    return out;
  }

  function tokensRegex(src, reglas) {
    const re = new RegExp(reglas.map(([n, r]) => `(?<${n}>${r})`).join("|"), "gm");
    const out = []; let i = 0, m;
    while ((m = re.exec(src))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      if (m.index > i) out.push([src.slice(i, m.index), ""]);
      const k = Object.keys(m.groups).find((g) => m.groups[g] !== undefined);
      out.push([m[0], k]); i = m.index + m[0].length;
    }
    if (i < src.length) out.push([src.slice(i), ""]);
    return out;
  }

  function tokens(src, fichero) {
    switch (ext(fichero)) {
      case "html": case "xml": case "svg": case "xhtml":
        return tokensMarcas(src);
      case "json":
        return tokensRegex(src, [["key", '"[^"\\n]*"(?=\\s*:)'], ["str", '"[^"\\n]*"?'], ["num", "-?\\b\\d+(?:\\.\\d+)?\\b"],
          ["kw", "\\b(?:true|false|null)\\b"], ["punct", "[{}\\[\\],:]"]]);
      case "yml": case "yaml":
        return tokensRegex(src, [["com", "#.*$"], ["key", "^[ \\t]*(?:- )?[\\w.\\-]+(?=:)"], ["str", "\"[^\"\\n]*\"?|'[^'\\n]*'?"],
          ["num", "\\b\\d+(?:\\.\\d+)?\\b"], ["kw", "\\b(?:true|false|null)\\b"], ["punct", "^[ \\t]*-|:"]]);
      case "css":
        return tokensRegex(src, [["com", "/\\*[\\s\\S]*?\\*/"], ["tag", "^[^{};\\n]+(?=\\s*\\{)"], ["key", "-{0,2}[a-zA-Z][\\w-]*(?=\\s*:(?!hover|focus|active|visited|root|first|last|nth|not|is|where|checked|invalid|valid|before|after))"],
          ["num", "#[0-9a-fA-F]{3,8}\\b|\\b\\d+(?:\\.\\d+)?(?:px|rem|em|%|vw|vh|fr|ms|s|deg|ch)?"], ["punct", "[{};:]"]]);
      case "md":
        return tokensRegex(src, [["head", "^#{1,6} .*$"], ["str", "\\*\\*[^*\\n]+\\*\\*|`[^`\\n]+`"], ["attr", "\\[[^\\]\\n]+\\]\\([^)\\n]+\\)"],
          ["punct", "^\\s*(?:[-*]|\\d+\\.)\\s"]]);
      default:
        return [[src, ""]];
    }
  }

  /** Convierte los tokens a HTML, marcando la zona [ini, fin) y el cursor en «cursor». */
  function pintar(src, fichero, ini, fin, cursor) {
    let html = "", pos = 0;
    const cortes = [ini, fin, cursor].filter((n) => n != null && n >= 0);
    for (const [t, k] of tokens(src, fichero)) {
      const finTok = pos + t.length;
      const puntos = [pos, ...cortes.filter((c) => c > pos && c < finTok), finTok];
      for (let q = 0; q < puntos.length - 1; q++) {
        const a = puntos[q], b = puntos[q + 1];
        if (cursor === a) html += '<span class="cursor"></span>';
        const trozo = esc(src.slice(a, b));
        const clases = [k ? "t-" + k : "", ini != null && a >= ini && b <= fin ? "nuevo" : ""].filter(Boolean).join(" ");
        html += clases ? `<span class="${clases}">${trozo}</span>` : trozo;
      }
      pos = finTok;
    }
    if (cursor === src.length) html += '<span class="cursor"></span>';
    // una línea por <span class="l"> (las etiquetas abiertas se cierran y reabren en cada salto)
    const lineas = []; let abiertas = [], actual = "";
    const re = /<span class="cursor"><\/span>|<span[^>]*>|<\/span>|\n|[^<\n]+/g; let m;
    while ((m = re.exec(html))) {
      const t = m[0];
      if (t === "\n") { lineas.push(actual + "</span>".repeat(abiertas.length)); actual = abiertas.join(""); }
      else if (t.includes("cursor")) actual += t;
      else if (t.startsWith("<span")) { actual += t; abiertas.push(t); }
      else if (t === "</span>") { actual += t; abiertas.pop(); }
      else actual += t;
    }
    lineas.push(actual);
    return lineas.map((l) => `<span class="l">${l || " "}</span>`).join("");
  }

  // ---------- vista previa ----------
  function dataURI(f, contenido) {
    const tipos = { svg: "image/svg+xml", css: "text/css", json: "application/json", xml: "application/xml", js: "text/javascript" };
    return `data:${tipos[ext(f)] || "text/plain"};charset=utf-8,${encodeURIComponent(contenido)}`;
  }

  function vistaHTML(estado, f) {
    let doc = estado[f];
    for (const otro of ficheros) {
      if (otro !== f && estado[otro]) doc = doc.split(`"${otro}"`).join(`"${dataURI(otro, estado[otro])}"`);
    }
    return doc;
  }

  const CSS_VISTA = `<style>
    body{font-family:"Open Sans",system-ui,sans-serif;margin:0;padding:16px;color:#3B3D35;font-size:15px}
    .estado{padding:10px 14px;border-radius:10px;margin-bottom:14px;font-weight:600}
    .ok{background:#E3F0DC;color:#3E6F2F}.error{background:#FBE3DE;color:#A8321F}
    .error pre{white-space:pre-wrap;font-weight:400;margin:6px 0 0;font-size:13px}
    ul{list-style:none;margin:0;padding-left:18px;border-left:2px solid #E6E1D8}
    li{margin:4px 0}
    .el{font-family:Consolas,monospace;color:#B76E12;font-weight:700}
    .at{font-family:Consolas,monospace;color:#6B7F55;font-size:13px}
    .tx{color:#3B3D35}.tipo{font-size:11px;color:#fff;background:#9C85C0;border-radius:4px;padding:0 5px;margin-left:6px}
    .k{font-family:Consolas,monospace;color:#A0526F;font-weight:700}
    .nota{font-size:12px;color:#6E7064;margin-top:14px}
  </style>`;

  function arbolXML(nodo) {
    let h = `<li><span class="el">&lt;${esc(nodo.nodeName)}&gt;</span>`;
    for (const a of nodo.attributes) h += ` <span class="at">${esc(a.name)}="${esc(a.value)}"</span>`;
    const hijos = [...nodo.childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue.trim()));
    if (hijos.length === 1 && hijos[0].nodeType === 3) return h + ` → <span class="tx">${esc(hijos[0].nodeValue.trim())}</span></li>`;
    if (hijos.length) {
      h += "<ul>";
      for (const n of hijos) h += n.nodeType === 1 ? arbolXML(n) : `<li class="tx">“${esc(n.nodeValue.trim())}”</li>`;
      h += "</ul>";
    }
    return h + "</li>";
  }

  function tipoJS(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return { string: "cadena", number: "número", boolean: "booleano", object: "objeto" }[typeof v];
  }
  function arbolDatos(v, clave) {
    const etiqueta = clave != null ? `<span class="k">${esc(String(clave))}</span>: ` : "";
    const t = tipoJS(v);
    if (t === "objeto" || t === "array") {
      const entradas = t === "array" ? v.map((x, i) => [i, x]) : Object.entries(v);
      return `<li>${etiqueta}<span class="tipo">${t}</span><ul>${entradas.map(([k, x]) => arbolDatos(x, k)).join("")}</ul></li>`;
    }
    return `<li>${etiqueta}<span class="tx">${esc(JSON.stringify(v))}</span><span class="tipo">${t}</span></li>`;
  }

  /** Analizador YAML mínimo (mapas, listas y escalares) para la vista previa didáctica. */
  function yamlParse(src) {
    const lineas = src.split("\n").map((l, n) => ({ n: n + 1, raw: l }))
      .filter((l) => l.raw.trim() && !l.raw.trim().startsWith("#"));
    for (const l of lineas) if (/^\t/.test(l.raw)) throw new Error(`Línea ${l.n}: YAML no admite tabuladores para sangrar.`);
    const escalar = (s) => {
      s = s.replace(/\s+#.*$/, "").trim();
      if (/^".*"$|^'.*'$/.test(s)) return s.slice(1, -1);
      if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
      if (s === "true" || s === "false") return s === "true";
      if (s === "null" || s === "~" || s === "") return null;
      if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(",").map((x) => escalar(x)).filter((x) => x !== null);
      return s;
    };
    let i = 0;
    const sangria = (l) => l.raw.match(/^ */)[0].length;
    function bloque(nivel) {
      const primera = lineas[i];
      const esLista = primera.raw.trim().startsWith("- ") || primera.raw.trim() === "-";
      const res = esLista ? [] : {};
      while (i < lineas.length) {
        const l = lineas[i], s = sangria(l);
        if (s < nivel) break;
        if (s > nivel) throw new Error(`Línea ${l.n}: sangría inesperada.`);
        let txt = l.raw.trim();
        if (esLista) {
          if (!txt.startsWith("-")) throw new Error(`Línea ${l.n}: se esperaba un elemento de lista «- ».`);
          txt = txt.replace(/^-\s*/, "");
          const m = /^([\w.\-]+):\s*(.*)$/.exec(txt);
          if (m) { // elemento de lista que es un mapa
            lineas[i] = { n: l.n, raw: " ".repeat(s + 2) + txt };
            res.push(bloque(s + 2));
          } else { res.push(escalar(txt)); i++; }
        } else {
          const m = /^([\w.\-]+):\s*(.*)$/.exec(txt);
          if (!m) throw new Error(`Línea ${l.n}: se esperaba «clave: valor».`);
          if (m[1] in res) throw new Error(`Línea ${l.n}: clave repetida «${m[1]}».`);
          i++;
          if (m[2] === "" && i < lineas.length && sangria(lineas[i]) > s) res[m[1]] = bloque(sangria(lineas[i]));
          else res[m[1]] = escalar(m[2]);
        }
      }
      return res;
    }
    return lineas.length ? bloque(sangria(lineas[0])) : null;
  }

  function documentoVista(estado, f) {
    const src = estado[f] || "";
    const e = ext(f);
    if (!src.trim()) return { doc: CSS_VISTA + '<p class="nota">El fichero todavía está vacío.</p>', estado: null };
    if (e === "html") return { doc: vistaHTML(estado, f), estado: null };
    if (e === "xhtml") {
      // XHTML: se analiza con el analizador XML del navegador, igual que haría con application/xhtml+xml
      const dom = new DOMParser().parseFromString(src, "application/xhtml+xml");
      const err = dom.querySelector("parsererror");
      if (err) {
        return { doc: CSS_VISTA + `<div class="estado error">✗ El documento XHTML NO está bien formado<pre>${esc(err.textContent.replace("This page contains the following errors:", "").replace(/Below is a rendering[\s\S]*$/, "").trim())}</pre></div>
          <p class="nota">Servido como <code>application/xhtml+xml</code>, el navegador no mostraría la página: el analizador XML se detiene en el primer error.</p>`, estado: "error" };
      }
      return { doc: vistaHTML(estado, f), estado: "ok" };
    }
    if (e === "svg" || e === "xml") {
      const dom = new DOMParser().parseFromString(src, e === "svg" ? "image/svg+xml" : "application/xml");
      const err = dom.querySelector("parsererror");
      if (err) {
        return { doc: CSS_VISTA + `<div class="estado error">✗ El documento NO está bien formado<pre>${esc(err.textContent.replace("This page contains the following errors:", "").replace(/Below is a rendering[\s\S]*$/, "").trim())}</pre></div>
          <p class="nota">El analizador (parser) se detiene en el primer error y no muestra nada más.</p>`, estado: "error" };
      }
      if (e === "svg") {
        return { doc: `<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff;background-image:linear-gradient(45deg,#f3f0ea 25%,transparent 25%,transparent 75%,#f3f0ea 75%),linear-gradient(45deg,#f3f0ea 25%,transparent 25%,transparent 75%,#f3f0ea 75%);background-size:20px 20px;background-position:0 0,10px 10px">${src}</body>`, estado: "ok" };
      }
      return { doc: CSS_VISTA + `<div class="estado ok">✓ XML bien formado</div><ul style="border:0;padding:0">${arbolXML(dom.documentElement)}</ul>
        <p class="nota">Árbol de elementos generado por el analizador XML del navegador.</p>`, estado: "ok" };
    }
    if (e === "json" || e === "yml" || e === "yaml") {
      try {
        const datos = e === "json" ? JSON.parse(src) : yamlParse(src);
        return { doc: CSS_VISTA + `<div class="estado ok">✓ ${e === "json" ? "JSON" : "YAML"} correcto</div><ul style="border:0;padding:0">${arbolDatos(datos)}</ul>
          <p class="nota">Estructura de datos que obtiene un programa al leer el fichero.</p>`, estado: "ok" };
      } catch (err) {
        return { doc: CSS_VISTA + `<div class="estado error">✗ Error de sintaxis<pre>${esc(err.message)}</pre></div>`, estado: "error" };
      }
    }
    if (e === "css") return { doc: CSS_VISTA + `<p class="nota">Las hojas de estilo se ven aplicadas en la vista del HTML.</p>`, estado: null };
    return { doc: CSS_VISTA + `<pre>${esc(src)}</pre>`, estado: null };
  }

  function actualizarVista(estado, f) {
    const { doc, estado: st } = documentoVista(estado, f);
    $("#eg-iframe").srcdoc = doc;
    $("#eg-vista-titulo").textContent = f;
    const marcaEstado = $("#eg-vista-estado");
    marcaEstado.className = "eg-estado" + (st ? " " + st : "");
    marcaEstado.textContent = st === "ok" ? (ext(f) === "xhtml" ? "bien formado" : "correcto") : st === "error" ? "con errores" : "";
  }

  // ---------- interfaz ----------
  function pestanas(estado) {
    const cont = $("#eg-pestanas");
    cont.innerHTML = "";
    ficheros.filter((f) => estado[f] !== "" || f === ficheroVisible).forEach((f) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = f; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", f === ficheroVisible);
      b.onclick = () => { ficheroVisible = f; dibujar(); };
      cont.appendChild(b);
    });
  }

  function estadoActual() { return paso < 0 ? vacio : estados[paso]; }

  function dibujar(textoEscribiendo, cursor) {
    const estado = estadoActual();
    pestanas(estado);
    const src = textoEscribiendo != null ? textoEscribiendo : estado[ficheroVisible];
    const m = marca && marca.fichero === ficheroVisible ? marca : null;
    $("#eg-pre").innerHTML = pintar(src, ficheroVisible, m ? m.ini : null, m ? m.fin : null, cursor);
    seguir($("#eg-pre .cursor") || $("#eg-pre .nuevo"));
    // pasos del enunciado
    document.querySelectorAll(".eg-pasos li").forEach((li, n) => {
      li.classList.toggle("hecho", n <= paso);
      li.classList.toggle("actual", n === Math.max(paso, 0));
    });
    $("#eg-num").textContent = `Paso ${Math.max(paso + 1, 0)} / ${E.pasos.length}`;
    $("#eg-barra").style.width = `${((paso + 1) / E.pasos.length) * 100}%`;
    $("#eg-play").textContent = reproduciendo ? "❚❚ Pausa" : paso >= E.pasos.length - 1 ? "↺ Repetir" : "▶ Reproducir";
  }

  /** Desplaza el panel de código (no la página) para que se vea el elemento. */
  function seguir(el) {
    if (!el) return;
    const pre = $("#eg-pre");
    const y = el.getBoundingClientRect().top - pre.getBoundingClientRect().top + pre.scrollTop;
    if (y < pre.scrollTop + 20 || y > pre.scrollTop + pre.clientHeight - 40) pre.scrollTop = Math.max(0, y - pre.clientHeight / 3);
  }

  function diff(antes, despues) {
    let a = 0;
    while (a < antes.length && a < despues.length && antes[a] === despues[a]) a++;
    let b = 0;
    while (b < antes.length - a && b < despues.length - a && antes[antes.length - 1 - b] === despues[despues.length - 1 - b]) b++;
    return { ini: a, finAntes: antes.length - b, finDespues: despues.length - b };
  }

  function irA(n, conMarca = true) {
    parar();
    paso = Math.max(-1, Math.min(n, E.pasos.length - 1));
    marca = null;
    if (paso >= 0) {
      const p = E.pasos[paso];
      const antes = paso > 0 ? estados[paso - 1][p.fichero] : "";
      const d = diff(antes, p.codigo);
      if (conMarca) marca = { fichero: p.fichero, ini: d.ini, fin: d.finDespues };
      ficheroVisible = p.fichero;
      actualizarVista(estados[paso], p.vista || p.fichero);
    } else {
      ficheroVisible = ficheros[0];
      actualizarVista(vacio, ficheros[0]);
    }
    dibujar();
  }

  function parar() {
    reproduciendo = false;
    clearTimeout(temporizador);
  }

  function animarPaso(n, alTerminar) {
    const p = E.pasos[n];
    const antes = n > 0 ? estados[n - 1][p.fichero] : "";
    const d = diff(antes, p.codigo);
    const prefijo = p.codigo.slice(0, d.ini), sufijo = p.codigo.slice(d.finDespues), insertado = p.codigo.slice(d.ini, d.finDespues);
    ficheroVisible = p.fichero;
    // se resalta el paso en el enunciado mientras se escribe
    document.querySelectorAll(".eg-pasos li").forEach((li, k) => li.classList.toggle("actual", k === n));
    let k = 0;
    const vel = VELOCIDADES[velocidad];
    const paso_ = Math.max(1, Math.round(4 / vel.ms));
    function tic() {
      if (!reproduciendo) return;
      k = Math.min(insertado.length, k + paso_);
      const texto = prefijo + insertado.slice(0, k) + sufijo;
      marca = { fichero: p.fichero, ini: d.ini, fin: d.ini + k };
      const estadoTemp = Object.assign({}, n > 0 ? estados[n - 1] : vacio, { [p.fichero]: texto });
      pestanas(estadoTemp);
      $("#eg-pre").innerHTML = pintar(texto, p.fichero, d.ini, d.ini + k, d.ini + k);
      seguir($("#eg-pre .cursor"));
      const ahora = Date.now();
      if (ahora - ultimaVista > 400 || k >= insertado.length) {
        ultimaVista = ahora;
        actualizarVista(estadoTemp, p.vista || p.fichero);
      }
      if (k < insertado.length) temporizador = setTimeout(tic, insertado[k - 1] === "\n" ? vel.ms * 6 : vel.ms);
      else { paso = n; marca = { fichero: p.fichero, ini: d.ini, fin: d.finDespues }; dibujar(); alTerminar(); }
    }
    $("#eg-num").textContent = `Paso ${n + 1} / ${E.pasos.length}`;
    tic();
  }

  function reproducir() {
    if (paso >= E.pasos.length - 1) irA(-1);
    reproduciendo = true;
    dibujar();
    const siguiente = () => {
      if (!reproduciendo) return;
      if (paso >= E.pasos.length - 1) { parar(); dibujar(); return; }
      animarPaso(paso + 1, () => { temporizador = setTimeout(siguiente, VELOCIDADES[velocidad].pausa); });
    };
    siguiente();
  }

  // ---------- montaje ----------
  function montar() {
    const ol = $("#eg-pasos");
    E.pasos.forEach((p, n) => {
      const li = document.createElement("li");
      li.tabIndex = 0;
      li.innerHTML = `<strong>${p.titulo}</strong><div class="detalle">${p.detalle || ""}</div>`;
      li.onclick = () => irA(n);
      li.onkeydown = (ev) => { if (ev.key === "Enter") irA(n); };
      ol.appendChild(li);
    });
    $("#eg-play").onclick = () => (reproduciendo ? (parar(), dibujar()) : reproducir());
    $("#eg-ant").onclick = () => irA(paso - 1);
    $("#eg-sig").onclick = () => irA(paso + 1);
    $("#eg-reiniciar").onclick = () => irA(-1);
    $("#eg-final").onclick = () => irA(E.pasos.length - 1, false);
    document.querySelectorAll(".eg-velocidad button").forEach((b) => {
      b.onclick = () => {
        velocidad = b.dataset.v;
        document.querySelectorAll(".eg-velocidad button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      };
    });
    $("#eg-info").onclick = () => $("#eg-ayuda-panel").classList.toggle("abierto");
    document.addEventListener("keydown", (ev) => {
      if (ev.target.closest && ev.target.closest("input, textarea")) return;
      if (ev.key === "ArrowRight") { ev.preventDefault(); irA(paso + 1); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); irA(paso - 1); }
      else if (ev.key === " ") { ev.preventDefault(); reproduciendo ? (parar(), dibujar()) : reproducir(); }
      else if (ev.key.toLowerCase() === "r") irA(-1);
    });
    simuladorAnchos();
    irA(-1);
  }

  // ---------- simulador de anchos de pantalla (EJEMPLO.anchos = [375, 768, 1200]) ----------
  function simuladorAnchos() {
    if (!Array.isArray(E.anchos) || !E.anchos.length) return;
    const ifr = $("#eg-iframe");
    const caja = document.createElement("div");
    caja.className = "eg-marco";
    caja.style.cssText = "position:relative;overflow:hidden;width:100%;";
    ifr.parentNode.insertBefore(caja, ifr);
    caja.appendChild(ifr);
    const grupo = document.createElement("span");
    grupo.className = "eg-anchos";
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", "Ancho de la pantalla simulada");
    let actual = 0;
    function aplicar() {
      const disponible = caja.clientWidth || 400;
      const alto = parseFloat(getComputedStyle(ifr).height) || 420;
      if (!actual) {
        ifr.style.width = "100%"; ifr.style.transform = ""; caja.style.height = "";
        ifr.style.height = "";
      } else {
        const esc = Math.min(1, disponible / actual);
        ifr.style.transformOrigin = "0 0";
        ifr.style.width = actual + "px";
        ifr.style.transform = `scale(${esc})`;
        const h = caja.dataset.alto ? parseFloat(caja.dataset.alto) : alto;
        caja.dataset.alto = h;
        ifr.style.height = (h / esc) + "px";
        caja.style.height = h + "px";
      }
    }
    [0].concat(E.anchos).forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = a ? a + " px" : "Ajustar";
      b.title = a ? `Simular una pantalla de ${a} px de ancho` : "Ancho real del panel";
      b.setAttribute("aria-pressed", a === actual);
      b.onclick = () => {
        actual = a;
        grupo.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        aplicar();
      };
      grupo.appendChild(b);
    });
    $("#t-vista").appendChild(grupo);
    window.addEventListener("resize", aplicar);
  }
  document.addEventListener("DOMContentLoaded", montar);
})();
