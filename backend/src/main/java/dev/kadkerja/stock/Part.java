package dev.kadkerja.stock;

import dev.kadkerja.job.RuleException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.Locale;

/**
 * A part the workshop keeps on the shelf. The count changes only through the methods here, and
 * every change is written down as a {@link StockMovement} by {@link StockService}.
 */
@Entity
@Table(name = "part")
public class Part {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Version private long version;

  @Column(nullable = false, unique = true, length = 30)
  private String sku;

  @Column(nullable = false, length = 200)
  private String name;

  @Column(name = "unit_price_sen", nullable = false)
  private long unitPriceSen;

  /** Below zero = that many still to order (taken for approved jobs before they arrived). */
  @Column(name = "on_hand", nullable = false)
  private int onHand;

  /** At or below this count the part shows as "low". */
  @Column(name = "reorder_level", nullable = false)
  private int reorderLevel;

  protected Part() {}

  public Part(String sku, String name, long unitPriceSen, int onHand, int reorderLevel) {
    this.sku = normalizeSku(sku);
    this.name = name;
    this.unitPriceSen = unitPriceSen;
    this.onHand = onHand;
    this.reorderLevel = reorderLevel;
  }

  /** " bp-001 " and "BP-001" are the same part number. */
  public static String normalizeSku(String sku) {
    return sku.trim().toUpperCase(Locale.ROOT);
  }

  /** Taken off the shelf for an approved job. May leave the count below zero. */
  void take(int quantity) {
    if (quantity <= 0) {
      throw new IllegalArgumentException("quantity must be positive");
    }
    onHand = Math.subtractExact(onHand, quantity);
  }

  void receive(int quantity) {
    if (quantity <= 0) {
      throw new RuleException("Receive at least 1.");
    }
    onHand = Math.addExact(onHand, quantity);
  }

  /** A stocktake: the shelf has this many. Returns the difference from the old count. */
  int count(int counted) {
    if (counted < 0) {
      throw new RuleException("A count cannot be below zero.");
    }
    int change = counted - onHand;
    onHand = counted;
    return change;
  }

  public boolean low() {
    return onHand <= reorderLevel;
  }

  public Long getId() {
    return id;
  }

  public String getSku() {
    return sku;
  }

  public String getName() {
    return name;
  }

  public long getUnitPriceSen() {
    return unitPriceSen;
  }

  public int getOnHand() {
    return onHand;
  }

  public int getReorderLevel() {
    return reorderLevel;
  }
}
