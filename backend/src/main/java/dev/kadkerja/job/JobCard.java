package dev.kadkerja.job;

import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;

/**
 * One visit of one car: the complaint, the quote and where the job is. All changes go through
 * the methods here so the status rules hold whoever calls them.
 */
@Entity
@Table(name = "job_card")
public class JobCard {
  private static final SecureRandom RANDOM = new SecureRandom();

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Version private long version;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "vehicle_id")
  private Vehicle vehicle;

  /** Who brought the car in this time (kept even if the car later changes owner). */
  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "customer_id")
  private Customer customer;

  @Column(nullable = false, length = 1000)
  private String complaint;

  @Column(name = "mileage_km")
  private Integer mileageKm;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private JobStatus status;

  /** Goes up each time the quote is sent again, so an answer to an old quote can be refused. */
  @Column(name = "quote_version", nullable = false)
  private int quoteVersion;

  /** For the customer's progress link (no login). Unguessable, never reused. */
  @Column(name = "public_token", nullable = false, unique = true, length = 32)
  private String publicToken;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @OneToMany(mappedBy = "jobCard", cascade = CascadeType.ALL, orphanRemoval = true)
  @OrderBy("id")
  private List<QuoteLine> lines = new ArrayList<>();

  @OneToMany(mappedBy = "jobCard", cascade = CascadeType.ALL, orphanRemoval = true)
  @OrderBy("id")
  private List<StatusEvent> events = new ArrayList<>();

  protected JobCard() {}

  public JobCard(Vehicle vehicle, String complaint, Integer mileageKm, Instant now) {
    this.vehicle = vehicle;
    this.customer = vehicle.getOwner();
    this.complaint = complaint;
    this.mileageKm = mileageKm;
    this.status = JobStatus.RECEIVED;
    this.createdAt = now;
    byte[] bytes = new byte[18];
    RANDOM.nextBytes(bytes);
    this.publicToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    events.add(new StatusEvent(this, null, JobStatus.RECEIVED, now, null));
  }

  /** "KK-2026-0042": shown on paper and in messages. */
  public String number() {
    int year = createdAt.atZone(java.time.ZoneId.of("Asia/Kuala_Lumpur")).getYear();
    return String.format("KK-%d-%04d", year, id);
  }

  public QuoteLine addLine(
      LineKind kind, String description, int quantity, long unitPriceSen, boolean taxable) {
    requireQuoteEditable();
    QuoteLine line = new QuoteLine(this, kind, description, quantity, unitPriceSen, taxable);
    lines.add(line);
    return line;
  }

  public void removeLine(long lineId) {
    requireQuoteEditable();
    if (!lines.removeIf(l -> l.getId() != null && l.getId() == lineId)) {
      throw new NotFoundException("This job card has no quote line " + lineId + ".");
    }
  }

  private void requireQuoteEditable() {
    if (!status.quoteEditable()) {
      throw new RuleException(
          "The quote can only be changed while the job is received or being inspected (now "
              + status
              + "). Move it back to INSPECTING to redo the quote.");
    }
  }

  /** Moves the job on; refuses a move the workshop flow does not allow. */
  public void moveTo(JobStatus to, String note, Instant now) {
    if (!status.canMoveTo(to)) {
      throw new RuleException("A job that is " + status + " cannot move to " + to + ".");
    }
    if (to == JobStatus.QUOTED) {
      if (lines.isEmpty()) {
        throw new RuleException("Add at least one quote line before sending the quote.");
      }
      quoteVersion++;
    }
    events.add(new StatusEvent(this, status, to, now, note));
    status = to;
  }

  public long subtotalSen() {
    return lines.stream().mapToLong(QuoteLine::subtotalSen).sum();
  }

  public long taxSen(int ratePercent) {
    return lines.stream().mapToLong(l -> l.taxSen(ratePercent)).sum();
  }

  public long totalSen(int ratePercent) {
    return Math.addExact(subtotalSen(), taxSen(ratePercent));
  }

  public Long getId() {
    return id;
  }

  public long getVersion() {
    return version;
  }

  public Vehicle getVehicle() {
    return vehicle;
  }

  public Customer getCustomer() {
    return customer;
  }

  public String getComplaint() {
    return complaint;
  }

  public Integer getMileageKm() {
    return mileageKm;
  }

  public JobStatus getStatus() {
    return status;
  }

  public int getQuoteVersion() {
    return quoteVersion;
  }

  public String getPublicToken() {
    return publicToken;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public List<QuoteLine> getLines() {
    return Collections.unmodifiableList(lines);
  }

  public List<StatusEvent> getEvents() {
    return Collections.unmodifiableList(events);
  }
}
