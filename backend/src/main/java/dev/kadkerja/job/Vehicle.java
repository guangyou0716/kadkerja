package dev.kadkerja.job;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.Locale;

@Entity
@Table(name = "vehicle")
public class Vehicle {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  /** Upper case, single spaces: "PKR 1234". Unique. */
  @Column(nullable = false, unique = true, length = 16)
  private String plate;

  @Column(nullable = false, length = 40)
  private String make;

  @Column(nullable = false, length = 40)
  private String model;

  @Column(name = "model_year")
  private Integer year;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "customer_id")
  private Customer owner;

  protected Vehicle() {}

  public Vehicle(String plate, String make, String model, Integer year, Customer owner) {
    this.plate = normalizePlate(plate);
    this.make = make;
    this.model = model;
    this.year = year;
    this.owner = owner;
  }

  /**
   * " pkr1234 ", "PKR  1234" -> "PKR 1234" and "wxy1234a" -> "WXY 1234 A", so the same car is
   * found however the plate is typed.
   */
  public static String normalizePlate(String plate) {
    return plate
        .replaceAll("\\s+", "")
        .toUpperCase(Locale.ROOT)
        .replaceAll("(?<=[A-Z])(?=[0-9])|(?<=[0-9])(?=[A-Z])", " ");
  }

  public Long getId() {
    return id;
  }

  public String getPlate() {
    return plate;
  }

  public String getMake() {
    return make;
  }

  public String getModel() {
    return model;
  }

  public Integer getYear() {
    return year;
  }

  public Customer getOwner() {
    return owner;
  }

  public void changeOwner(Customer owner) {
    this.owner = owner;
  }
}
