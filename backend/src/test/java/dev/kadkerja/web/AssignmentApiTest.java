package dev.kadkerja.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.kadkerja.staff.Role;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Technician assignment and "my jobs", with real sign-ins (no mock users). */
@SpringBootTest
@AutoConfigureMockMvc
class AssignmentApiTest {
  private static final String PASSWORD = "correct horse battery";
  private static int address = 1;

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired StaffUserRepository users;
  @Autowired PasswordEncoder encoder;

  private long advisorId;
  private long techId;
  private long otherTechId;
  private long goneTechId;
  private String ip;

  @BeforeEach
  void setUp() {
    for (String table :
        new String[] {"status_event", "quote_line", "job_card", "vehicle", "customer", "staff_user"}) {
      jdbc.update("delete from " + table);
    }
    advisorId = save("advisor", "Test Advisor", Role.ADVISOR, true);
    techId = save("tech", "Test Tech", Role.TECHNICIAN, true);
    otherTechId = save("tech2", "Other Tech", Role.TECHNICIAN, true);
    goneTechId = save("gone", "Left Tech", Role.TECHNICIAN, false);
    ip = "10.2.0." + (address++);
  }

  private long save(String username, String name, Role role, boolean active) {
    StaffUser u = new StaffUser(username, name, encoder.encode(PASSWORD), role);
    if (!active) {
      u.deactivate();
    }
    return users.save(u).getId();
  }

  private MockHttpSession session(String user) throws Exception {
    return (MockHttpSession)
        mvc.perform(
                post("/api/auth/login")
                    .with(r -> {
                      r.setRemoteAddr(ip);
                      return r;
                    })
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"" + user + "\",\"password\":\"" + PASSWORD + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
  }

  private ResultActions send(
      org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b,
      MockHttpSession s,
      String body)
      throws Exception {
    return mvc.perform(b.session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  private long checkIn(MockHttpSession advisor, String plate) throws Exception {
    String body =
        send(
                post("/api/jobs"),
                advisor,
                """
                {"customerName":"Test Owner","phone":"012-0000009","plate":"%s","make":"Perodua",
                 "model":"Bezza","complaint":"Brakes squeak"}
                """
                    .formatted(plate))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return ((Number) JsonPath.read(body, "$.id")).longValue();
  }

  private ResultActions assign(MockHttpSession s, long job, Object staffId) throws Exception {
    return send(put("/api/jobs/" + job + "/assignee"), s, "{\"staffId\":" + staffId + "}");
  }

  private ResultActions move(MockHttpSession s, long job, String to) throws Exception {
    return send(post("/api/jobs/" + job + "/moves"), s, "{\"to\":\"" + to + "\"}");
  }

  @Test
  void theAdvisorAssignsATechnicianWhoSeesItInMyJobs() throws Exception {
    MockHttpSession advisor = session("advisor");
    long a = checkIn(advisor, "ASG 1");
    long b = checkIn(advisor, "ASG 2");
    mvc.perform(get("/api/jobs/" + a).session(advisor)).andExpect(jsonPath("$.assignedTo").value(nullValue()));

    assign(advisor, a, techId)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.assignedTo.id").value(techId))
        .andExpect(jsonPath("$.assignedTo.name").value("Test Tech"));
    assign(advisor, b, otherTechId).andExpect(status().isOk());

    mvc.perform(get("/api/jobs").session(advisor))
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[1].assignedTo.name").value("Test Tech"))
        .andExpect(jsonPath("$[0].assignedTo.name").value("Other Tech"));
    MockHttpSession tech = session("tech");
    mvc.perform(get("/api/jobs?mine=true").session(tech))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].plate").value("ASG 1"));
    mvc.perform(get("/api/jobs?mine=true").session(advisor)).andExpect(jsonPath("$", hasSize(0)));

    // Taking the job back: nobody has it, and it leaves the technician's list.
    assign(advisor, a, null).andExpect(status().isOk()).andExpect(jsonPath("$.assignedTo").value(nullValue()));
    mvc.perform(get("/api/jobs?mine=true").session(tech)).andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void onlyAnActiveTechnicianCanBeGivenAJobAndOnlyByTheAdvisor() throws Exception {
    MockHttpSession advisor = session("advisor");
    long a = checkIn(advisor, "ASG 3");
    for (Object id : new Object[] {advisorId, goneTechId, 999_999}) {
      assign(advisor, a, id)
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.detail").value("Pick an active technician."));
    }
    assign(session("tech"), a, techId).andExpect(status().isForbidden());
    assign(advisor, a, "\"x\"").andExpect(status().isBadRequest());
    mvc.perform(get("/api/jobs/" + a).session(advisor)).andExpect(jsonPath("$.assignedTo").value(nullValue()));

    // A finished job keeps whoever worked on it.
    assign(advisor, a, techId).andExpect(status().isOk());
    move(advisor, a, "CANCELLED").andExpect(status().isOk());
    assign(advisor, a, otherTechId)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("A CANCELLED job cannot be reassigned."));
    mvc.perform(get("/api/jobs/" + a).session(advisor)).andExpect(jsonPath("$.assignedTo.name").value("Test Tech"));
  }

  @Test
  void aTechnicianCannotWorkOnAnotherTechniciansJob() throws Exception {
    MockHttpSession advisor = session("advisor");
    long a = checkIn(advisor, "ASG 4");
    assign(advisor, a, otherTechId).andExpect(status().isOk());
    MockHttpSession tech = session("tech");
    move(tech, a, "INSPECTING")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.detail").value("This job is assigned to Other Tech. Ask the service advisor to reassign it."));
    send(
            post("/api/jobs/" + a + "/lines"),
            tech,
            "{\"kind\":\"PART\",\"description\":\"Pads\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":true}")
        .andExpect(status().isForbidden());

    // The assigned technician can; the line they add cannot be removed by the other one.
    MockHttpSession other = session("tech2");
    String body =
        send(
                post("/api/jobs/" + a + "/lines"),
                other,
                "{\"kind\":\"PART\",\"description\":\"Pads\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":true}")
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long lineId = ((Number) JsonPath.read(body, "$.lines[0].id")).longValue();
    mvc.perform(delete("/api/jobs/" + a + "/lines/" + lineId).session(tech).with(csrf()))
        .andExpect(status().isForbidden());
    move(other, a, "INSPECTING").andExpect(status().isOk());
    // The advisor is never blocked by an assignment.
    mvc.perform(delete("/api/jobs/" + a + "/lines/" + lineId).session(advisor).with(csrf()))
        .andExpect(status().isOk());
  }

  @Test
  void aTechnicianWhoStartsAnUnassignedJobTakesIt() throws Exception {
    MockHttpSession advisor = session("advisor");
    long a = checkIn(advisor, "ASG 5");
    MockHttpSession tech = session("tech");
    move(tech, a, "INSPECTING")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.assignedTo.id").value(techId));
    // Now it is theirs: the other technician is kept out.
    send(
            post("/api/jobs/" + a + "/lines"),
            session("tech2"),
            "{\"kind\":\"LABOUR\",\"description\":\"Check\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":true}")
        .andExpect(status().isForbidden());
    // A refused move does not take the job either.
    long b = checkIn(advisor, "ASG 6");
    move(tech, b, "CANCELLED").andExpect(status().isForbidden());
    mvc.perform(get("/api/jobs/" + b).session(advisor)).andExpect(jsonPath("$.assignedTo").value(nullValue()));
  }

  @Test
  void theStaffListIsForTheAdvisorAndHasNoPasswordHashes() throws Exception {
    mvc.perform(get("/api/staff")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/staff").session(session("tech"))).andExpect(status().isForbidden());
    String body =
        mvc.perform(get("/api/staff").session(session("advisor")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(4)))
            .andExpect(jsonPath("$[3].username").value("gone"))
            .andExpect(jsonPath("$[3].active").value(false))
            .andExpect(jsonPath("$[0].name").value("Other Tech"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(body).doesNotContain("{bcrypt}").doesNotContainIgnoringCase("password");
  }
}
