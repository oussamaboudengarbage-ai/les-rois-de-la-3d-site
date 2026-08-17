const DEFAULT_PRODUCTS_JSON_URL =
  "https://opensheet.elk.sh/1KHd21NIpAbtMcEUI9NtQ3rvp4pgbZ4xJmQn2-eEI7Ss/1";

const DEFAULT_SITE_URL = "https://lesroisdela3d.dpdns.org";

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

export async function onRequestGet(context) {
  const productsUrl =
    context.env.PRODUCTS_JSON_URL || DEFAULT_PRODUCTS_JSON_URL;

  const siteUrl = String(
    context.env.SITE_URL || DEFAULT_SITE_URL
  ).replace(/\/+$/, "");

  try {
    const response = await fetch(productsUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error("Catalogue indisponible.");

    const products = await response.json();

    const urls = [
      siteUrl + "/",
      ...((Array.isArray(products) ? products : [])
        .filter((product) => product && product.nom)
        .map(
          (product) =>
            siteUrl +
            "/produits/" +
            encodeURIComponent(productSlug(product))
        )),
    ];

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls
        .map((url) => "  <url><loc>" + xmlEscape(url) + "</loc></url>")
        .join("\n") +
      "\n</urlset>";

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      },
    });
  } catch (error) {
    console.error("Les Rois de la 3D sitemap:", error);

    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' +
        xmlEscape(siteUrl + "/") +
        "</loc></url></urlset>",
      {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
