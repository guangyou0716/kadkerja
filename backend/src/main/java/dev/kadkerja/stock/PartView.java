package dev.kadkerja.stock;

/** A stock part as the API returns it. */
public record PartView(
    long id, String sku, String name, long unitPriceSen, int onHand, int reorderLevel, boolean low) {
  public static PartView of(Part p) {
    return new PartView(
        p.getId(), p.getSku(), p.getName(), p.getUnitPriceSen(), p.getOnHand(), p.getReorderLevel(), p.low());
  }
}
