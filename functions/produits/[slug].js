const DEFAULT_PRODUCTS_JSON_URL =
  "https://opensheet.elk.sh/1KHd21NIpAbtMcEUI9NtQ3rvp4pgbZ4xJmQn2-eEI7Ss/1";

const DEFAULT_SITE_URL = "https://lesroisdela3d.dpdns.org";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110) || "produit";
}

function productSlug(product) {
  const raw = [product.id, product.nom]
    .filter((value) => String(value || "").trim())
    .join("-");
  return slugify(raw || product.nom || product.id || "produit");
}

function parsePrice(value) {
  let cleaned = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!cleaned) return null;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else {
    cleaned = cleaned.replace(",", ".");
  }

  const result = Number(cleaned);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function stockInfo(value) {
  const raw = String(value ?? "").trim().toLowerCase();

  if (!raw || raw === "illimite" || raw === "illimité" || raw === "unlimited") {
    return { available: true, limit: null, label: "Disponible" };
  }

  const number = Number.parseInt(raw, 10);

  if (Number.isInteger(number)) {
    if (number <= 0) {
      return { available: false, limit: 0, label: "Rupture de stock" };
    }
    return {
      available: true,
      limit: number,
      label: number === 1 ? "1 exemplaire disponible" : `${number} exemplaires disponibles`,
    };
  }

  return { available: true, limit: null, label: "Disponible" };
}

function imageList(product) {
  const values = [product.image, product.image_detail]
    .map((value) => String(value || "").trim())
    .filter((value) => /^https?:\/\//i.test(value));

  return [...new Set(values)];
}

function colorCodes(product) {
  return String(product.couleurs_codes || "")
    .split("/")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^#[0-9A-F]{3,8}$/.test(value));
}

function colorNames(product) {
  return String(product.couleurs || "")
    .split(/[,/;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function siteUrl(env, request) {
  const configured = String(env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  try {
    const url = new URL(configured);
    return url.origin;
  } catch {
    return new URL(request.url).origin;
  }
}

function metaDescription(product) {
  const text = String(product.description || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 155);
  return `${String(product.nom || "Création 3D")} fabriqué avec soin par Les Rois de la 3D à Reims.`;
}

function notFound(site) {
  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <title>Produit introuvable — Les Rois de la 3D</title>
  <style>
    body{margin:0;background:#f5f3ef;color:#171717;font-family:Inter,system-ui,sans-serif}
    main{min-height:100vh;display:grid;place-items:center;padding:30px;text-align:center}
    a{display:inline-flex;margin-top:18px;padding:13px 18px;border-radius:14px;background:#111;color:#fff;text-decoration:none;font-weight:800}
  </style>
</head>
<body><main><div><h1>Produit introuvable</h1><p>Cette fiche n’existe plus ou son adresse a changé.</p><a href="${escapeHtml(site)}/#catalogue">Retour au catalogue</a></div></main></body>
</html>`;

  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const site = siteUrl(env, request);
  const wantedSlug = decodeURIComponent(String(params.slug || ""));
  const productsUrl = env.PRODUCTS_JSON_URL || DEFAULT_PRODUCTS_JSON_URL;

  let products;

  try {
    const response = await fetch(productsUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error("Catalogue indisponible.");
    products = await response.json();
  } catch (error) {
    console.error("Les Rois de la 3D product page:", error);
    return new Response("Catalogue temporairement indisponible.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const product = (Array.isArray(products) ? products : []).find(
    (item) => item && productSlug(item) === wantedSlug
  );

  if (!product) return notFound(site);

  const name = String(product.nom || "Création 3D").trim();
  const description = String(product.description || "").trim();
  const category = String(product.categorie || "").trim();
  const material = String(product.materiau || "").trim();
  const dimensions = String(product.dimensions || "").trim();
  const fabricationTime = String(product.temps || "").trim();
  const images = imageList(product);
  const colors = colorCodes(product);
  const names = colorNames(product);
  const price = parsePrice(product.prix);
  const numericPrice = price !== null;
  const stock = stockInfo(product.stock);
  const canonical = `${site}/produits/${encodeURIComponent(productSlug(product))}`;
  const selectedDefaultColor = colors[0] || "";

  const productSchema = numericPrice
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name,
        description: description || metaDescription(product),
        sku: String(product.id || name),
        url: canonical,
        ...(images.length ? { image: images } : {}),
        ...(category ? { category } : {}),
        ...(material ? { material } : {}),
        ...(names.length ? { color: names.join(", ") } : {}),
        offers: {
          "@type": "Offer",
          url: canonical,
          priceCurrency: "EUR",
          price: price.toFixed(2),
          availability: stock.available
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
        },
      }
    : null;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Accueil",
        item: `${site}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Catalogue",
        item: `${site}/#catalogue`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name,
        item: canonical,
      },
    ],
  };

  const mainImage = images[0] || "";
  const secondImage = images[1] || "";
  const formattedPrice = numericPrice
    ? new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(price)
    : "Sur devis";

  const colorsHtml = colors.length
    ? `<div class="color-area">
        <span class="spec-label">Couleur</span>
        <div class="swatches" id="swatches">
          ${colors.map((code, index) => {
            const label = names[index] || code;
            return `<button class="swatch${index === 0 ? " active" : ""}" type="button" data-color="${escapeHtml(code)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" style="--swatch:${escapeHtml(code)}"></button>`;
          }).join("")}
        </div>
        <span class="selected-color" id="selectedColorLabel">${escapeHtml(names[0] || colors[0] || "")}</span>
      </div>`
    : "";

  const details = [
    ["Catégorie", category],
    ["Matière", material],
    ["Dimensions", dimensions],
    ["Fabrication", fabricationTime],
  ].filter(([, value]) => value);

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(name)} — Les Rois de la 3D</title>
  <meta name="description" content="${escapeHtml(metaDescription(product))}">
  <meta name="theme-color" content="#ff6b35">
  <meta name="color-scheme" content="light dark">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(name)} — Les Rois de la 3D">
  <meta property="og:description" content="${escapeHtml(metaDescription(product))}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${mainImage ? `<meta property="og:image" content="${escapeHtml(mainImage)}">` : ""}
  ${productSchema ? `<script type="application/ld+json">${jsonLd(productSchema)}</script>` : ""}
  <script type="application/ld+json">${jsonLd(breadcrumbSchema)}</script>

  <style>
    :root{
      --bg:#f5f3ef;--surface:#fff;--surface2:#faf8f5;--text:#171717;
      --muted:#74706b;--border:#ded9d2;--accent:#ff6b35;--accent-dark:#df4f1c;
      --shadow:0 22px 65px rgba(0,0,0,.09)
    }
    *{box-sizing:border-box}html{scroll-behavior:smooth}
    body{margin:0;background:radial-gradient(circle at 12% 0,rgba(255,107,53,.10),transparent 28%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body.dark{--bg:#0f0f10;--surface:#18181a;--surface2:#232326;--text:#f4f2ee;--muted:#aaa7a2;--border:#36363a;--shadow:0 25px 80px rgba(0,0,0,.35)}
    a{color:inherit;text-decoration:none}button,input{font:inherit}button{cursor:pointer}
    .announcement{min-height:38px;display:flex;align-items:center;justify-content:center;gap:28px;padding:8px 16px;background:#111;color:#fff;font-size:10px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}
    .dot{display:inline-block;width:5px;height:5px;margin-right:6px;border-radius:50%;background:var(--accent);vertical-align:middle}
    .header{position:sticky;top:16px;z-index:50;display:flex;width:min(calc(100% - 30px),1180px);min-height:78px;align-items:center;justify-content:space-between;gap:18px;margin:16px auto 0;padding:11px 15px;border:1px solid var(--border);border-radius:24px;background:color-mix(in srgb,var(--surface) 92%,transparent);box-shadow:0 12px 45px rgba(0,0,0,.07);backdrop-filter:blur(18px)}
    .brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:900;text-transform:uppercase}
    .brand-mark{display:grid;width:48px;height:48px;place-items:center;border:1px solid rgba(255,107,53,.28);border-radius:13px;background:var(--surface2);color:var(--accent);font-size:13px;font-weight:950;letter-spacing:-.04em}
    .brand b{color:var(--accent)}
    .nav{display:flex;gap:22px;color:var(--muted);font-size:10px;font-weight:850;text-transform:uppercase}
    .actions{display:flex;align-items:center;gap:8px}
    .icon,.cart{display:inline-flex;min-height:44px;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text);-webkit-appearance:none;appearance:none}
    .icon{width:44px}.cart{gap:7px;padding:0 15px;background:#111;color:#fff;border-color:#111;font-size:10px;font-weight:900;text-transform:uppercase}
    .badge{display:inline-flex;min-width:22px;height:22px;align-items:center;justify-content:center;padding:0 6px;border-radius:999px;background:var(--accent);font-size:9px}
    .wrap{width:min(calc(100% - 30px),1180px);margin:0 auto;padding:55px 0 90px}
    .crumb{margin-bottom:24px;color:var(--muted);font-size:10px}.crumb a:hover{color:var(--accent)}
    .product{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:58px;align-items:start}
    .gallery{display:grid;gap:12px}.main-image{overflow:hidden;aspect-ratio:1/1;border:1px solid var(--border);border-radius:28px;background:var(--surface);box-shadow:var(--shadow)}
    .main-image img{display:block;width:100%;height:100%;object-fit:cover}.placeholder{display:grid;width:100%;height:100%;place-items:center;color:var(--muted);font-weight:800}
    .thumbs{display:flex;gap:10px}.thumb{width:74px;height:74px;overflow:hidden;padding:0;border:2px solid transparent;border-radius:15px;background:var(--surface)}.thumb.active{border-color:var(--accent)}.thumb img{width:100%;height:100%;object-fit:cover}
    .info{position:sticky;top:120px;padding:30px;border:1px solid var(--border);border-radius:28px;background:var(--surface);box-shadow:var(--shadow)}
    .eyebrow{margin:0 0 9px;color:var(--accent);font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(38px,5vw,62px);line-height:.98;letter-spacing:-.055em}.desc{margin:18px 0;color:var(--muted);line-height:1.75}
    .price-row{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:22px 0;padding:18px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
    .price{font-size:31px;font-weight:950;letter-spacing:-.045em}.stock{padding:8px 10px;border-radius:999px;background:rgba(34,168,90,.10);color:#168247;font-size:9px;font-weight:900;text-transform:uppercase}.stock.out{background:rgba(214,75,69,.10);color:#c1433d}
    .spec-label{display:block;margin-bottom:8px;color:var(--muted);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .color-area{margin:20px 0}.swatches{display:flex;flex-wrap:wrap;gap:8px}.swatch{width:35px;height:35px;border:3px solid var(--surface);border-radius:50%;background:var(--swatch);box-shadow:0 0 0 1px var(--border)}.swatch.active{box-shadow:0 0 0 2px var(--accent)}.selected-color{display:block;margin-top:8px;color:var(--muted);font-size:10px}
    .buy-row{display:grid;grid-template-columns:110px 1fr;gap:10px;margin-top:22px}.qty{width:100%;min-height:52px;padding:0 13px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);color:var(--text);text-align:center}
    .primary{display:inline-flex;min-height:52px;align-items:center;justify-content:center;border:0;border-radius:14px;background:var(--accent);color:#fff;font-size:10px;font-weight:950;letter-spacing:.05em;text-transform:uppercase}.primary:hover{background:var(--accent-dark)}.primary:disabled{opacity:.45;cursor:not-allowed}
    .details{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:24px}.detail{padding:13px;border-radius:14px;background:var(--surface2)}.detail span{display:block;color:var(--muted);font-size:8px;font-weight:900;text-transform:uppercase}.detail strong{display:block;margin-top:4px;font-size:11px}
    .toast{position:fixed;right:18px;bottom:18px;z-index:100;transform:translateY(12px);opacity:0;padding:13px 16px;border-radius:14px;background:#111;color:#fff;font-size:11px;font-weight:800;transition:.22s}.toast.show{transform:none;opacity:1}
    @media(max-width:900px){.nav{display:none}.product{grid-template-columns:1fr}.info{position:static}}
    @media(max-width:560px){.announcement span:nth-child(2){display:none}.brand-name{display:none}.header{width:calc(100% - 18px);top:8px;margin-top:8px;padding:9px;gap:8px}.brand-mark{width:42px;height:42px}.actions{gap:6px}.icon{width:42px;min-height:42px}.cart{min-height:42px;padding:0 9px}.wrap{width:calc(100% - 20px);padding-top:30px}.info{padding:20px;border-radius:22px}.main-image{border-radius:22px}.buy-row{grid-template-columns:84px 1fr}.details{grid-template-columns:1fr}.thumb{width:66px;height:66px}}
  </style>
</head>
<body>
  <div class="announcement">
    <span>Livraison affichée dans le panier</span>
    <span><i class="dot"></i> Fabrication locale à Reims</span>
    <span><i class="dot"></i> Paiement sécurisé</span>
  </div>

  <header class="header">
    <a class="brand" href="/#accueil" aria-label="Accueil Les Rois de la 3D">
      <span class="brand-mark" aria-hidden="true">LR3D</span>
      <span class="brand-name">Les Rois de la <b>3D</b></span>
    </a>

    <nav class="nav" aria-label="Navigation principale">
      <a href="/#catalogue">Catalogue</a>
      <a href="/#savoir-faire">Notre savoir-faire</a>
      <a href="/#atelier">Atelier</a>
      <a href="/#faq">FAQ</a>
      <a href="/#contact">Contact</a>
    </nav>

    <div class="actions">
      <button class="icon" id="themeToggle" type="button" aria-label="Changer le thème">◐</button>
      <a class="icon" href="/compte.html" aria-label="Mon compte" title="Mon compte">◎</a>
      <a class="cart" href="/?panier=1">Panier <span class="badge" id="cartCount">0</span></a>
    </div>
  </header>

  <main class="wrap">
    <nav class="crumb" aria-label="Fil d’Ariane">
      <a href="/">Accueil</a> / <a href="/#catalogue">Catalogue</a> / ${escapeHtml(name)}
    </nav>

    <section class="product">
      <div class="gallery">
        <div class="main-image">
          ${mainImage
            ? `<img id="mainProductImage" src="${escapeHtml(mainImage)}" alt="${escapeHtml(name)}">`
            : `<div class="placeholder">Les Rois de la 3D</div>`}
        </div>
        ${(mainImage && secondImage)
          ? `<div class="thumbs">
              <button class="thumb active" data-image="${escapeHtml(mainImage)}" type="button"><img src="${escapeHtml(mainImage)}" alt=""></button>
              <button class="thumb" data-image="${escapeHtml(secondImage)}" type="button"><img src="${escapeHtml(secondImage)}" alt=""></button>
            </div>`
          : ""}
      </div>

      <article class="info">
        <p class="eyebrow">${escapeHtml(category || "Création Les Rois de la 3D")}</p>
        <h1>${escapeHtml(name)}</h1>
        <p class="desc">${escapeHtml(description || "Fabrication soignée en impression 3D, réalisée avec attention à Reims.")}</p>

        <div class="price-row">
          <strong class="price">${escapeHtml(formattedPrice)}</strong>
          <span class="stock${stock.available ? "" : " out"}">${escapeHtml(stock.label)}</span>
        </div>

        ${colorsHtml}

        ${numericPrice
          ? `<div class="buy-row">
              <input class="qty" id="qty" type="number" min="1" max="${stock.limit ?? 99}" value="1" ${stock.available ? "" : "disabled"}>
              <button class="primary" id="addButton" type="button" ${stock.available ? "" : "disabled"}>
                ${stock.available ? "Ajouter au panier" : "Rupture de stock"}
              </button>
            </div>`
          : `<a class="primary" href="/#contact" style="width:100%;margin-top:20px">Demander un devis</a>`}

        ${details.length
          ? `<div class="details">${details.map(([label, value]) =>
              `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
            ).join("")}</div>`
          : ""}
      </article>
    </section>
  </main>

  <div class="toast" id="toast">Ajouté au panier.</div>

  <script>
    const CART_KEY = "lesroisdela3d_cart_v1";
    const THEME_KEY = "lesroisdela3d_theme_mode_v2";
    const product = ${JSON.stringify({
      id: String(product.id || name),
      name,
      price: price,
      image: mainImage,
      stockLimit: stock.limit,
    })};
    let selectedColor = ${JSON.stringify(selectedDefaultColor)};

    function loadCart() {
      try {
        const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    }

    function saveCart(cart) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartCount();
    }

    function updateCartCount() {
      const cart = loadCart();
      const count = cart.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
      document.getElementById("cartCount").textContent = String(count);
    }

    function showToast() {
      const toast = document.getElementById("toast");
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    }

    document.querySelectorAll(".thumb").forEach((button) => {
      button.addEventListener("click", () => {
        const image = document.getElementById("mainProductImage");
        if (!image) return;
        image.src = button.dataset.image;
        document.querySelectorAll(".thumb").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
      });
    });

    document.querySelectorAll(".swatch").forEach((button) => {
      button.addEventListener("click", () => {
        selectedColor = button.dataset.color || "";
        document.querySelectorAll(".swatch").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        const label = document.getElementById("selectedColorLabel");
        if (label) label.textContent = button.title || selectedColor;
      });
    });

    const addButton = document.getElementById("addButton");
    if (addButton) {
      addButton.addEventListener("click", () => {
        const quantityNode = document.getElementById("qty");
        const quantity = Math.max(1, Math.min(99, parseInt(quantityNode.value, 10) || 1));
        const cart = loadCart();

        const key = String(product.id) + "::" + selectedColor;
        const existing = cart.find((item) =>
          String(item.id) + "::" + String(item.color || "") === key
        );

        if (existing) {
          existing.quantity = Math.min(
            product.stockLimit === null ? 99 : product.stockLimit,
            (parseInt(existing.quantity, 10) || 0) + quantity
          );
        } else {
          cart.push({
            id: String(product.id),
            name: String(product.name),
            price: Number(product.price),
            image: String(product.image || ""),
            color: selectedColor,
            stockLimit: product.stockLimit,
            quantity:
              product.stockLimit === null
                ? quantity
                : Math.min(quantity, product.stockLimit),
          });
        }

        saveCart(cart);
        showToast();
      });
    }

    const systemTheme = matchMedia("(prefers-color-scheme: dark)");
    let theme = localStorage.getItem(THEME_KEY) || "auto";
    const themeToggle = document.getElementById("themeToggle");

    function paintTheme() {
      const dark = theme === "dark" || (theme === "auto" && systemTheme.matches);
      document.body.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      themeToggle.textContent = theme === "auto" ? "◐" : dark ? "☾" : "☀";
    }

    themeToggle.addEventListener("click", () => {
      theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
      localStorage.setItem(THEME_KEY, theme);
      paintTheme();
    });

    systemTheme.addEventListener("change", () => {
      if (theme === "auto") paintTheme();
    });

    updateCartCount();
    paintTheme();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
