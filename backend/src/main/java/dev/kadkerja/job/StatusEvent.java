package dev.kadkerja.job;

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

/** One move of a job card, kept for the timeline. */
@Entity
@Table(name = "status_event")
public class StatusEvent {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "job_card_id")
  private JobCard jobCard;

  @Enumerated(EnumType.STRING)
  @Column(name = "from_status", length = 20)
  private JobStatus from;

  @Enumerated(EnumType.STRING)
  @Column(name = "to_status", nullable = false, length = 20)
  private JobStatus to;

  @Column(name = "occurred_at", nullable = false)
  private Instant at;

  @Column(length = 500)
  private String note;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  private Actor actor;

  protected StatusEvent() {}

  StatusEvent(JobCard jobCard, JobStatus from, JobStatus to, Instant at, String note, Actor actor) {
    this.jobCard = jobCard;
    this.actor = actor;
    this.from = from;
    this.to = to;
    this.at = at;
    this.note = note;
  }

  public JobStatus getFrom() {
    return from;
  }

  public JobStatus getTo() {
    return to;
  }

  public Instant getAt() {
    return at;
  }

  public String getNote() {
    return note;
  }

  public Actor getActor() {
    return actor;
  }
}
