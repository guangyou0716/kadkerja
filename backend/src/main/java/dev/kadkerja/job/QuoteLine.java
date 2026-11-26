package dev.kadkerja.job;

import dev.kadkerja.stock.Part;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** A labour or part line of a job card's quote. */
@Entity
@Table(name = "quote_line")
public class QuoteLine {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "job_card_id")
  private JobCard jobCard;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  private LineKind kind;

  @Column(nullable = false, length = 200)
  private String description;

  @Column(nullable = false)
  private int quantity;

  @Column(name = "unit_price_sen", nullable = false)
  private long unitPriceSen;

  @Column(nullable = false)
  private boolean taxable;

  /** The stock part this line uses (taken off the shelf when the quote is approved), or null. */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "part_id")
  private Part part;

  protected QuoteLine() {}

  QuoteLine(
      JobCard jobCard,
      LineKind kind,
      String description,
      int quantity,
      long unitPriceSen,
      boolean taxable,
      Part part) {
    this.jobCard = jobCard;
    this.kind = kind;
    this.description = description;
    this.quantity = quantity;
    this.unitPriceSen = unitPriceSen;
    this.taxable = taxable;
    this.part = part;
  }

  public Long getId() {
    return id;
  }

  public LineKind getKind() {
    return kind;
  }

  public String getDescription() {
    return description;
  }

  public int getQuantity() {
    return quantity;
  }

  public long getUnitPriceSen() {
    return unitPriceSen;
  }

  public boolean isTaxable() {
    return taxable;
  }

  public Part getPart() {
    return part;
  }

  public long subtotalSen() {
    return Math.multiplyExact(unitPriceSen, (long) quantity);
  }

  public long taxSen(int ratePercent) {
    return taxable ? Money.tax(subtotalSen(), ratePercent) : 0;
  }
}
