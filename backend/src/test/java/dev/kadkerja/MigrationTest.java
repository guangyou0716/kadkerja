package dev.kadkerja;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** A database written by an older version keeps working after the newer migrations run. */
class MigrationTest {
  @Test
  void v2KeepsOldTimelinesAndMarksThemAsStaffMoves() {
    var ds =
        new DriverManagerDataSource(
            "jdbc:h2:mem:mig-" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
    JdbcTemplate jdbc = new JdbcTemplate(ds);
    Flyway.configure().dataSource(ds).target("1").load().migrate();
    jdbc.update("insert into customer (id, name, phone) values (1, 'Old Owner', '012-0000001')");
    jdbc.update(
        "insert into vehicle (id, plate, make, model, model_year, customer_id) values (1, 'OLD 1', 'Proton', 'Wira', 1999, 1)");
    jdbc.update(
        "insert into job_card (id, version, vehicle_id, customer_id, complaint, status, quote_version, public_token, created_at)"
            + " values (1, 0, 1, 1, 'Old job', 'QUOTED', 1, 'AAAAAAAAAAAAAAAAAAAAAAAA', TIMESTAMP WITH TIME ZONE '2026-01-01 00:00:00+00')");
    jdbc.update(
        "insert into status_event (job_card_id, from_status, to_status, occurred_at, note)"
            + " values (1, null, 'RECEIVED', TIMESTAMP WITH TIME ZONE '2026-01-01 00:00:00+00', null),"
            + " (1, 'RECEIVED', 'QUOTED', TIMESTAMP WITH TIME ZONE '2026-01-01 01:00:00+00', 'old note')");

    var result = Flyway.configure().dataSource(ds).load().migrate();

    assertThat(result.targetSchemaVersion).isEqualTo("2");
    assertThat(jdbc.queryForList("select actor from status_event order by id", String.class))
        .containsExactly("STAFF", "STAFF");
    assertThat(jdbc.queryForObject("select note from status_event where to_status = 'QUOTED'", String.class))
        .isEqualTo("old note");
  }
}
