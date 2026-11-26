package dev.kadkerja.stock;

import dev.kadkerja.job.JobCard;
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
import java.time.Instant;

/** One change to a part's count: why, when, by whom and (for parts taken) for which job. */
@Entity
@Table(name = "stock_movement")
public class StockMovement {
  public enum Reason {
    /** Added as the first count when the part was created, or a stocktake difference. */
    COUNTED,
    RECEIVED,
    /** Taken for a job when its quote was approved. */
    TAKEN
  }

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "part_id")
  private Part part;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "job_card_id")
  private JobCard jobCard;

  @Column(name = "quantity_change", nullable = false)
  private int quantityChange;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private Reason reason;

  @Column(name = "occurred_at", nullable = false)
  private Instant at;

  /** The member of staff, or null when the customer approved through their link. */
  @Column(name = "by_name", length = 100)
  private String byName;

  protected StockMovement() {}

  StockMovement(Part part, JobCard jobCard, int quantityChange, Reason reason, Instant at, String byName) {
    this.part = part;
    this.jobCard = jobCard;
    this.quantityChange = quantityChange;
    this.reason = reason;
    this.at = at;
    this.byName = byName;
  }

  public Long getId() {
    return id;
  }

  public Part getPart() {
    return part;
  }

  public JobCard getJobCard() {
    return jobCard;
  }

  public int getQuantityChange() {
    return quantityChange;
  }

  public Reason getReason() {
    return reason;
  }

  public Instant getAt() {
    return at;
  }

  public String getByName() {
    return byName;
  }
}
