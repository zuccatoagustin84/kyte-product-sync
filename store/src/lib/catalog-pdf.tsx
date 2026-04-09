/* eslint-disable jsx-a11y/alt-text -- <Image> here is @react-pdf/renderer's PDF primitive, not an HTML <img>. */
/**
 * React-PDF based catalog generator. Produces a real PDF on the server with
 * grid and list layouts and careful page-break control:
 *   - Cover + each category live in their own <Page>
 *   - Category header repeats on every page of the category (`fixed`)
 *   - Footer with page numbers is `fixed` too
 *   - Individual grid rows and list rows are `wrap={false}` so products never
 *     get split between two pages
 */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "./react-pdf-compat";
import type { CatalogCategory, CatalogProduct } from "./catalog";
import type { ImageCache, PdfImageData } from "./catalog-images";

export type CatalogMode = "grid" | "list";

const COLORS = {
  navy: "#1a1a2e",
  navyMid: "#16213e",
  navyLight: "#0f3460",
  accent: "#e94560",
  accentLight: "#ff6b81",
  border: "#e0e0e6",
  bg: "#f4f4f8",
  muted: "#8a8a9a",
  lightMuted: "#c8c8d8",
};

const styles = StyleSheet.create({
  // ── Cover ──────────────────────────────────────────────────────────────────
  coverPage: {
    backgroundColor: COLORS.navy,
    padding: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  coverInner: {
    alignItems: "center",
    width: "100%",
  },
  coverRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    backgroundColor: "rgba(233,69,96,0.15)",
  },
  coverRingText: {
    color: COLORS.accent,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: 1,
  },
  coverCompany: {
    fontSize: 28,
    fontWeight: 800,
    color: "#ffffff",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 6,
  },
  coverCompanySub: {
    fontSize: 11,
    fontWeight: 400,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 4,
    textTransform: "uppercase",
    textAlign: "center",
  },
  coverRule: {
    width: 60,
    height: 4,
    backgroundColor: COLORS.accent,
    marginTop: 28,
    marginBottom: 28,
  },
  coverTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 10,
  },
  coverDate: {
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  coverStats: {
    marginTop: 48,
    flexDirection: "row",
    gap: 48,
  },
  statCol: { alignItems: "center" },
  statValue: {
    fontSize: 26,
    fontWeight: 700,
    color: COLORS.accentLight,
    textAlign: "center",
  },
  statLabel: {
    fontSize: 8,
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 6,
    textAlign: "center",
  },

  // ── Category pages ─────────────────────────────────────────────────────────
  page: {
    backgroundColor: "#ffffff",
    paddingBottom: 32,
  },
  catHeader: {
    backgroundColor: COLORS.navy,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  catLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  catBar: {
    width: 4,
    height: 30,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  catName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  catCount: {
    fontSize: 8,
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
  },
  catBadge: {
    fontSize: 8,
    fontWeight: 600,
    color: "rgba(255,255,255,0.85)",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  // ── Grid mode ──────────────────────────────────────────────────────────────
  gridContainer: {
    padding: 14,
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  card: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 5,
    overflow: "hidden",
  },
  cardEmpty: {
    flex: 1,
  },
  imgWrap: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#f8f8fb",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  placeholder: {
    fontSize: 7,
    color: COLORS.lightMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardBody: {
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  name: {
    fontSize: 8.5,
    fontWeight: 600,
    color: COLORS.navy,
    lineHeight: 1.3,
    marginBottom: 2,
  },
  code: {
    fontSize: 6.5,
    color: COLORS.muted,
    fontFamily: "Courier",
    marginBottom: 4,
  },
  priceLabel: {
    fontSize: 6,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  priceValue: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.navy,
  },

  // ── List mode ──────────────────────────────────────────────────────────────
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  listImgWrap: {
    width: 42,
    height: 42,
    backgroundColor: "#f8f8fb",
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 3,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  listImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  listPlaceholder: {
    fontSize: 6,
    color: COLORS.lightMuted,
    textTransform: "uppercase",
  },
  listInfo: {
    flex: 1,
    paddingRight: 10,
  },
  listName: {
    fontSize: 9.5,
    fontWeight: 600,
    color: COLORS.navy,
    lineHeight: 1.3,
  },
  listCode: {
    fontSize: 7,
    color: COLORS.muted,
    fontFamily: "Courier",
    marginTop: 2,
  },
  listPrice: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.navy,
    minWidth: 70,
    textAlign: "right",
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 12,
    left: 24,
    right: 24,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "center",
  },
});

function formatPrice(value: number): string {
  return "$" + Math.round(value).toLocaleString("es-AR");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getImage(p: CatalogProduct, cache: ImageCache): PdfImageData | null {
  if (!p.imageUrl) return null;
  return cache.get(p.imageUrl) ?? null;
}

interface CatalogDocumentProps {
  categories: CatalogCategory[];
  companyName: string;
  generatedDate: string;
  showPrices: boolean;
  mode: CatalogMode;
  imageCache: ImageCache;
}

export function CatalogDocument({
  categories,
  companyName,
  generatedDate,
  showPrices,
  mode,
  imageCache,
}: CatalogDocumentProps) {
  const totalProducts = categories.reduce((s, c) => s + c.products.length, 0);
  const nameParts = companyName.split(" ");
  const firstWord = nameParts[0] ?? companyName;
  const restName = nameParts.slice(1).join(" ");

  return (
    <Document title={`${companyName} — Catálogo`} author={companyName}>
      {/* ── Cover ───────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverInner}>
          <View style={styles.coverRing}>
            <Text style={styles.coverRingText}>MP</Text>
          </View>
          <Text style={styles.coverCompany}>{firstWord}</Text>
          {restName ? (
            <Text style={styles.coverCompanySub}>{restName}</Text>
          ) : null}
          <View style={styles.coverRule} />
          <Text style={styles.coverTitle}>Catálogo de Productos</Text>
          <Text style={styles.coverDate}>{generatedDate.toUpperCase()}</Text>
          <View style={styles.coverStats}>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{categories.length}</Text>
              <Text style={styles.statLabel}>Categorías</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{totalProducts}</Text>
              <Text style={styles.statLabel}>Productos</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ── Category pages ──────────────────────────────────────────────── */}
      {categories.map((cat) => (
        <Page key={cat.name} size="A4" style={styles.page} wrap>
          <View style={styles.catHeader} fixed>
            <View style={styles.catLeft}>
              <View style={styles.catBar} />
              <View>
                <Text style={styles.catName}>{cat.name}</Text>
                <Text style={styles.catCount}>
                  {cat.products.length} producto
                  {cat.products.length !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
            <Text style={styles.catBadge}>Lista Mayorista</Text>
          </View>

          {mode === "grid" ? (
            <View style={styles.gridContainer}>
              {chunk(cat.products, 3).map((row, rowIdx) => (
                <View key={rowIdx} style={styles.gridRow} wrap={false}>
                  {row.map((p, i) => {
                    const img = getImage(p, imageCache);
                    return (
                      <View key={`${rowIdx}-${i}`} style={styles.card}>
                        <View style={styles.imgWrap}>
                          {img ? (
                            <Image src={img} style={styles.img} />
                          ) : (
                            <Text style={styles.placeholder}>Sin imagen</Text>
                          )}
                        </View>
                        <View style={styles.cardBody}>
                          <Text style={styles.name}>{p.name}</Text>
                          <Text style={styles.code}>Cód: {p.code || "—"}</Text>
                          {showPrices ? (
                            <>
                              <Text style={styles.priceLabel}>
                                Precio mayorista
                              </Text>
                              <Text style={styles.priceValue}>
                                {formatPrice(p.salePrice)}
                              </Text>
                            </>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {Array.from({ length: 3 - row.length }, (_, i) => (
                    <View key={`empty-${i}`} style={styles.cardEmpty} />
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.listContainer}>
              {cat.products.map((p, i) => {
                const img = getImage(p, imageCache);
                return (
                  <View key={i} style={styles.listRow} wrap={false}>
                    <View style={styles.listImgWrap}>
                      {img ? (
                        <Image src={img} style={styles.listImg} />
                      ) : (
                        <Text style={styles.listPlaceholder}>S/I</Text>
                      )}
                    </View>
                    <View style={styles.listInfo}>
                      <Text style={styles.listName}>{p.name}</Text>
                      <Text style={styles.listCode}>Cód: {p.code || "—"}</Text>
                    </View>
                    {showPrices ? (
                      <Text style={styles.listPrice}>
                        {formatPrice(p.salePrice)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <Text
            style={styles.footer}
            fixed
            render={({ pageNumber, totalPages }) =>
              `${companyName}  •  Página ${pageNumber} de ${totalPages}  •  ${generatedDate}`
            }
          />
        </Page>
      ))}
    </Document>
  );
}
