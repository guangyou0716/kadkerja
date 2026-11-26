-- The technician working on the job. Optional: jobs from before this version have nobody assigned.
alter table job_card add column assigned_to bigint references staff_user (id);
create index job_card_assigned_to on job_card (assigned_to);
