package dev.kadkerja.job;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "customer")
public class Customer {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 100)
  private String name;

  @Column(nullable = false, length = 20)
  private String phone;

  protected Customer() {}

  public Customer(String name, String phone) {
    this.name = name;
    this.phone = phone;
  }

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getPhone() {
    return phone;
  }

  public void update(String name, String phone) {
    this.name = name;
    this.phone = phone;
  }
}
