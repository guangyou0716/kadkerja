package dev.kadkerja.photo;

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
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

/** One stored photo (always a JPEG made by {@link PhotoImages}). Listed through {@link PhotoInfo}, which leaves the bytes out. */
@Entity
@Table(name = "job_photo")
public class JobPhoto {
  private static final SecureRandom RANDOM = new SecureRandom();

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "job_card_id")
  private JobCard jobCard;

  @Column(name = "public_key", nullable = false, unique = true, length = 16)
  private String publicKey;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  private PhotoStage stage;

  @Column(nullable = false)
  private int width;

  @Column(nullable = false)
  private int height;

  @Column(name = "size_bytes", nullable = false)
  private int sizeBytes;

  @Column(nullable = false)
  private byte[] data;

  @Column(length = 200)
  private String caption;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "by_name", nullable = false, length = 100)
  private String byName;

  protected JobPhoto() {}

  JobPhoto(JobCard jobCard, PhotoStage stage, PhotoImages.Jpeg jpeg, String caption, Instant at, String byName) {
    this.jobCard = jobCard;
    this.stage = stage;
    this.width = jpeg.width();
    this.height = jpeg.height();
    this.data = jpeg.bytes();
    this.sizeBytes = jpeg.bytes().length;
    this.caption = caption;
    this.createdAt = at;
    this.byName = byName;
    this.publicKey = newKey();
  }

  /** 12 random bytes (96 bits) as 16 URL-safe characters. */
  static String newKey() {
    byte[] bytes = new byte[12];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  public Long getId() {
    return id;
  }

  public JobCard getJobCard() {
    return jobCard;
  }

  public String getPublicKey() {
    return publicKey;
  }

  public PhotoStage getStage() {
    return stage;
  }

  public byte[] getData() {
    return data;
  }

  public int getSizeBytes() {
    return sizeBytes;
  }
}
